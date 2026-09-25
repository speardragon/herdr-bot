import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import {
  createModelCatalog,
  listBotModels,
  parseGrokModelsOutput,
  parseOpencodeModelsOutput,
  projectCodexModels,
  type CodexChildProcess,
  type ModelCatalog,
  type ModelCatalogResult,
} from "../src/bots/model-catalog.ts";

/** Polls the catalog's cached value for `kind` until it matches `expected`, instead of sleeping a
 * fixed duration -- the background refresh under test is a real child-process spawn plus a cache
 * write, and neither step's completion is otherwise observable from the test. A fixed sleep would be
 * calibrated for an idle machine and flake under full-suite parallel load. */
async function waitForModels(catalog: ModelCatalog, kind: string, expected: unknown, timeoutMs = 5_000): Promise<ModelCatalogResult> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await catalog.listBotModels(kind);
    if (JSON.stringify(result.models) === JSON.stringify(expected)) return result;
    if (Date.now() >= deadline) throw new Error(`waitForModels: "${kind}" never reached ${JSON.stringify(expected)} (last saw ${JSON.stringify(result.models)})`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

interface FixtureBin {
  readonly dir: string;
  readonly env: NodeJS.ProcessEnv;
  cleanup(): void;
}

/** A throwaway directory prepended to PATH, holding fixture executables that stand in for the real
 * provider CLIs (`grok`, `opencode`, `codex`). Extensionless scripts under a directory with no
 * package.json default to CommonJS, so `require(...)` works even though this repo is `"type":
 * "module"`. */
function makeFixtureBin(): FixtureBin {
  const dir = mkdtempSync(join(tmpdir(), "hb-model-bin-"));
  return {
    dir,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function writeBin(dir: string, name: string, script: string): void {
  writeFileSync(join(dir, name), `#!/usr/bin/env node\n${script}`, { mode: 0o755 });
}

/** A fake Codex app-server: NDJSON over stdio, requires `initialize` before `model/list`, and
 * interleaves an unrelated notification (no `id`) to prove those are correctly ignored. `models` is
 * spliced verbatim into the `model/list` response's `data` array. */
function codexServerScript(models: readonly unknown[]): string {
  return `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: msg.id, result: { codexHome: "/tmp" } }) + "\\n");
    process.stdout.write(JSON.stringify({ method: "remoteControl/status/changed", params: { status: "disabled" } }) + "\\n");
  } else if (msg.method === "model/list") {
    process.stdout.write(JSON.stringify({ id: msg.id, result: { data: ${JSON.stringify(models)}, nextCursor: null } }) + "\\n");
  }
});
`;
}

test("parseGrokModelsOutput reads the bullet lines and dedups while preserving order", () => {
  const stdout = [
    "You are logged in with grok.com.",
    "",
    "Default model: grok-4.7",
    "",
    "Available models:",
    "  * grok-4.7 (default)",
    "  - grok-4.7-build-fast",
    "  - grok-4.7-build-fast",
    "  - grok-4.6",
    "  - grok-4.5",
    "",
  ].join("\n");
  assert.deepEqual(parseGrokModelsOutput(stdout), [
    { id: "grok-4.7", label: "grok-4.7" },
    { id: "grok-4.7-build-fast", label: "grok-4.7-build-fast" },
    { id: "grok-4.6", label: "grok-4.6" },
    { id: "grok-4.5", label: "grok-4.5" },
  ]);
});

test("parseOpencodeModelsOutput reads one provider/model id per line and dedups", () => {
  const stdout = ["opencode/big-pickle", "github-copilot/claude-opus-4.8", "github-copilot/claude-opus-4.8", "openai/gpt-5.4", ""].join("\n");
  assert.deepEqual(parseOpencodeModelsOutput(stdout), [
    { id: "opencode/big-pickle", label: "opencode/big-pickle" },
    { id: "github-copilot/claude-opus-4.8", label: "github-copilot/claude-opus-4.8" },
    { id: "openai/gpt-5.4", label: "openai/gpt-5.4" },
  ]);
});

test("projectCodexModels maps the app-server Model schema, falls back id -> model, and dedups", () => {
  const data = [
    { id: "gpt-6-astra", model: "gpt-6-astra", displayName: "GPT-6-Astra", hidden: false, isDefault: true },
    { id: "gpt-6-astra", model: "gpt-6-astra", displayName: "GPT-6-Astra (dup)", hidden: false, isDefault: true },
    { model: "gpt-6-sol", displayName: "GPT-6-Sol", hidden: false, isDefault: false },
    { id: "no-display-name" },
    { notAModel: true },
  ];
  assert.deepEqual(projectCodexModels(data), [
    { id: "gpt-6-astra", label: "GPT-6-Astra" },
    { id: "gpt-6-sol", label: "GPT-6-Sol" },
    { id: "no-display-name", label: "no-display-name" },
  ]);
});

test("claude and gemini expose their latest-version aliases without spawning anything", async () => {
  const catalog = createModelCatalog({ env: { PATH: "/definitely/not/a/real/path" } });
  assert.deepEqual(await catalog.listBotModels("claude"), {
    models: [
      { id: "opus", label: "opus" },
      { id: "sonnet", label: "sonnet" },
      { id: "haiku", label: "haiku" },
    ],
    source: "latest-alias",
  });
  assert.deepEqual(await catalog.listBotModels("gemini"), {
    models: [
      { id: "auto", label: "auto" },
      { id: "pro", label: "pro" },
      { id: "flash", label: "flash" },
      { id: "flash-lite", label: "flash-lite" },
    ],
    source: "latest-alias",
  });
});

test("a kind without model-selection capability returns unavailable immediately", async () => {
  const catalog = createModelCatalog({ env: { PATH: "/definitely/not/a/real/path" } });
  assert.deepEqual(await catalog.listBotModels("cursor"), { models: [], source: "unavailable" });
});

test("grok: installed CLI output becomes an installed-cli result", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "grok", `process.stdout.write(${JSON.stringify("Available models:\n  * grok-4.7 (default)\n  - grok-4.6\n")});`);
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    const result = await catalog.listBotModels("grok");
    assert.equal(result.source, "installed-cli");
    assert.deepEqual(result.models, [
      { id: "grok-4.7", label: "grok-4.7" },
      { id: "grok-4.6", label: "grok-4.6" },
    ]);
  } finally {
    bin.cleanup();
  }
});

test("grok: empty CLI output becomes unavailable", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "grok", `process.stdout.write("");`);
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    assert.deepEqual(await catalog.listBotModels("grok"), { models: [], source: "unavailable", error: "grok models returned no models" });
  } finally {
    bin.cleanup();
  }
});

test("grok: a nonzero exit becomes unavailable", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "grok", `process.stderr.write("not logged in"); process.exit(1);`);
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    const result = await catalog.listBotModels("grok");
    assert.equal(result.source, "unavailable");
    assert.equal(result.error, "not logged in");
  } finally {
    bin.cleanup();
  }
});

test("grok: a CLI missing from PATH becomes unavailable", async () => {
  const catalog = createModelCatalog({ env: { PATH: "/definitely/not/a/real/path" }, platform: "linux" });
  const result = await catalog.listBotModels("grok");
  assert.equal(result.source, "unavailable");
  assert.match(result.error ?? "", /not installed/);
});

test("grok: exceeding the timeout becomes unavailable, without waiting for the full timeout", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "grok", "setInterval(() => {}, 1000);"); // never exits
    const catalog = createModelCatalog({ env: bin.env, timeoutMs: 200, platform: "linux" });
    const started = Date.now();
    const result = await catalog.listBotModels("grok");
    assert.ok(Date.now() - started < 4000, "should not wait anywhere near the real 5s default timeout");
    assert.equal(result.source, "unavailable");
  } finally {
    bin.cleanup();
  }
});

test("opencode: installed CLI output becomes an installed-cli result, preserving CLI order", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "opencode", `process.stdout.write("opencode/big-pickle\\ngithub-copilot/claude-opus-4.8\\nopenai/gpt-5.4\\n");`);
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    const result = await catalog.listBotModels("opencode");
    assert.equal(result.source, "installed-cli");
    assert.deepEqual(result.models.map((m) => m.id), ["opencode/big-pickle", "github-copilot/claude-opus-4.8", "openai/gpt-5.4"]);
  } finally {
    bin.cleanup();
  }
});

test("opencode: empty CLI output becomes unavailable", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "opencode", `process.stdout.write("");`);
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    assert.deepEqual(await catalog.listBotModels("opencode"), { models: [], source: "unavailable", error: "opencode models returned no models" });
  } finally {
    bin.cleanup();
  }
});

test("codex: app-server model/list becomes an installed-cli result, deduped and in server order", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(
      bin.dir,
      "codex",
      codexServerScript([
        { id: "gpt-6-astra", model: "gpt-6-astra", displayName: "GPT-6-Astra", hidden: false },
        { id: "gpt-6-astra", model: "gpt-6-astra", displayName: "GPT-6-Astra", hidden: false },
        { id: "gpt-6-sol", model: "gpt-6-sol", displayName: "GPT-6-Sol", hidden: false },
      ]),
    );
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    const result = await catalog.listBotModels("codex");
    assert.equal(result.source, "installed-cli");
    assert.deepEqual(result.models, [
      { id: "gpt-6-astra", label: "GPT-6-Astra" },
      { id: "gpt-6-sol", label: "GPT-6-Sol" },
    ]);
  } finally {
    bin.cleanup();
  }
});

test("codex: an empty model/list result becomes unavailable", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "codex", codexServerScript([]));
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    assert.deepEqual(await catalog.listBotModels("codex"), { models: [], source: "unavailable", error: "codex app-server returned no models" });
  } finally {
    bin.cleanup();
  }
});

test("codex: a JSON-RPC error on model/list becomes unavailable", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(
      bin.dir,
      "codex",
      `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: msg.id, result: {} }) + "\\n");
  } else if (msg.method === "model/list") {
    process.stdout.write(JSON.stringify({ id: msg.id, error: { code: -32600, message: "restart Codex" } }) + "\\n");
  }
});
`,
    );
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    const result = await catalog.listBotModels("codex");
    assert.equal(result.source, "unavailable");
    assert.equal(result.error, "restart Codex");
  } finally {
    bin.cleanup();
  }
});

test("codex: a server that never replies times out to unavailable, without waiting for the full timeout", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "codex", `setInterval(() => {}, 1000);`); // reads stdin, replies to nothing
    const catalog = createModelCatalog({ env: bin.env, timeoutMs: 200, platform: "linux" });
    const started = Date.now();
    const result = await catalog.listBotModels("codex");
    assert.ok(Date.now() - started < 4000, "should not wait anywhere near the real 5s default timeout");
    assert.equal(result.source, "unavailable");
  } finally {
    bin.cleanup();
  }
});

test("codex: a binary missing from PATH becomes unavailable (mirrors the grok ENOENT case, since codex spawns via a different code path)", async () => {
  const catalog = createModelCatalog({ env: { PATH: "/definitely/not/a/real/path" }, platform: "linux" });
  const result = await catalog.listBotModels("codex");
  assert.equal(result.source, "unavailable");
});

// End-to-end behavioral coverage for review finding: a stray `child.stdin` write error (e.g. the real
// app-server answering `initialize` and then exiting before `model/list` is sent) must resolve
// gracefully, not crash the host process with an uncaught 'error' event.
//
// This test alone does NOT reliably discriminate pre-fix from post-fix code: direct experimentation
// (documented in the Task 6 fix-round-1 report) found that in this Node/OS environment, the buffered
// reply data is consistently delivered to and handled by the "data" listener, and the resulting
// second stdin write consistently completes, before the child's death is processed on the parent
// side -- across several adversarial exit-timing variants, none reproduced a crash even against
// pre-fix code. It is kept as real end-to-end coverage of the observable outcome (a graceful
// `"unavailable"` result, not a hang or a thrown exception escaping the test). The actual regression
// guard for the listener-placement fix is the mechanism-level test below, which tests the "is a
// listener attached before any write" invariant directly against a fully-controlled fake child, and
// does discriminate.
test("codex: the server replying to initialize and exiting before model/list is sent resolves gracefully (does not crash the host process)", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(
      bin.dir,
      "codex",
      `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    // Flush the reply, then exit immediately -- by the time the parent's stdout "data" handler has
    // parsed this line and written "model/list" to our stdin, our end of that pipe is already gone.
    process.stdout.write(JSON.stringify({ id: msg.id, result: { codexHome: "/tmp" } }) + "\\n", () => {
      process.exit(0);
    });
  }
});
`,
    );
    const catalog = createModelCatalog({ env: bin.env, platform: "linux" });
    const started = Date.now();
    const result = await catalog.listBotModels("codex");
    assert.ok(Date.now() - started < 4000, "should resolve via the exit path, not idle out the full 5s timeout");
    assert.equal(result.source, "unavailable");
  } finally {
    bin.cleanup();
  }
});

// Mechanism-level regression test for the same review finding, and the one that actually
// discriminates pre-fix from post-fix code (unlike the end-to-end test above -- see its comment).
// Rather than racing a real subprocess's OS-scheduled exit timing, this drives a fully-controlled fake
// `ChildProcess` (a plain `EventEmitter`, whose `stdin`/`stdout` are themselves plain `EventEmitter`s
// -- exactly what a real `ChildProcess` and its stdin/stdout streams structurally are) through the
// precise interaction shape the fix closes: the buffered `initialize` reply is handled synchronously
// inside the stdout "data" listener, which synchronously issues the second stdin write from inside
// that same callback -- and that second write is made to emit an 'error' on the stdin stream
// synchronously. (A real EPIPE surfaces asynchronously, on a later tick; emitting synchronously here
// only tightens the test, since the invariant under test -- whether an error listener is registered on
// `stdin` before any write can happen -- depends only on listener-registration order, which this test
// controls precisely, not on when the emit happens.)
//
// This discriminates for real: a plain `EventEmitter` with no listener for 'error' throws synchronously
// out of `.emit("error", ...)` (Node's documented default behavior for the special-cased 'error'
// event). If the fix regressed to attaching `child.stdin.on("error", ...)` only inside `finish()`
// (which has not run yet at the point of the second write), that throw would escape this test's
// `assert.doesNotThrow` call and fail it. With the listener attached immediately after spawn (the
// current, correct code), the emit finds a listener and is swallowed, so nothing throws. Verified
// empirically both ways (see the Task 6 fix-round-2 report for the scratch-copy revert-and-rerun).
test("codex: an error listener is attached to child.stdin before any write happens (mechanism-level, deterministic)", async () => {
  let writeCount = 0;
  const stdin = new EventEmitter() as EventEmitter & { write(chunk: string): boolean };
  stdin.write = (_chunk: string): boolean => {
    writeCount += 1;
    if (writeCount === 2) {
      // Simulates the second write (the `model/list` send) hitting a broken pipe.
      stdin.emit("error", new Error("EPIPE: broken pipe (test)"));
    }
    return true;
  };
  const stdout = new EventEmitter();
  const childEmitter = new EventEmitter();
  const child = Object.assign(childEmitter, { stdin, stdout, kill: () => {} }) as unknown as CodexChildProcess;

  const catalog = createModelCatalog({
    platform: "linux",
    timeoutMs: 500, // belt-and-braces: if a pre-fix throw escaped send() and finish() never ran, don't hang the suite
    spawnCodexProcess: () => child,
  });

  const pending = catalog.listBotModels("codex");
  // Let the pending microtasks run to completion (the spawn-env getter's await, then
  // runCodexModelList's synchronous executor: spawn, attach the stdin error listener, send
  // `initialize`). A single setImmediate macrotask boundary is enough regardless of the exact
  // microtask hop count, since Node always drains the microtask queue before a macrotask callback.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(writeCount, 1, "initialize should have been sent by now");
  assert.equal(
    stdin.listenerCount("error"),
    1,
    "a listener must already be registered on stdin before any write happens -- this is the fix's actual invariant",
  );

  assert.doesNotThrow(() => {
    stdout.emit("data", Buffer.from(`${JSON.stringify({ id: 1, result: {} })}\n`));
  }, "the second stdin write's 'error' event must be swallowed by the pre-attached listener, not thrown");
  assert.equal(writeCount, 2, "model/list should have been sent, triggered synchronously by handling the initialize reply");

  childEmitter.emit("exit", 1);
  const result = await pending;
  assert.equal(result.source, "unavailable");
});

// Regression tests for review finding: on macOS, herdr starts new interactive panes as **login**
// shells by default (`terminal.shell_mode = "auto"`, herdr's configuration.mdx: "starts login shells
// on macOS so login-only PATH setup ... runs in new panes"), so the CLI lookup basis for grok/
// opencode/codex must match that, not just this host process's own inherited PATH.
test("darwin: a CLI reachable only through the login shell's PATH is found, unioned in front of the inherited PATH", async () => {
  const bin = makeFixtureBin(); // bin.dir holds the fixture "grok"; bin.env.PATH would include it, but we deliberately don't use bin.env below.
  const shellDir = mkdtempSync(join(tmpdir(), "hb-model-shell-"));
  try {
    writeBin(bin.dir, "grok", `process.stdout.write("Available models:\\n  - grok-4.7\\n");`);
    // Stands in for a real login shell: ignores whatever `-lc <script>` it's given and always reports
    // a PATH containing the fixture CLI's directory, exactly like a real login shell would report a
    // PATH that gained a Homebrew/nvm directory the inherited env never had.
    writeBin(
      shellDir,
      "fake-login-shell",
      `process.stdout.write("last login noise, ignored\\n"); process.stdout.write("\\n__HB_PATH__" + ${JSON.stringify(bin.dir)} + "\\n");`,
    );
    const catalog = createModelCatalog({
      env: { PATH: process.env.PATH ?? "", SHELL: join(shellDir, "fake-login-shell") }, // note: NOT bin.env -- bin.dir is absent from this inherited PATH
      platform: "darwin",
    });
    const result = await catalog.listBotModels("grok");
    assert.equal(result.source, "installed-cli");
    assert.deepEqual(result.models, [{ id: "grok-4.7", label: "grok-4.7" }]);
  } finally {
    bin.cleanup();
    rmSync(shellDir, { recursive: true, force: true });
  }
});

test("darwin: a login shell probe failure (missing/broken SHELL) falls back to the inherited PATH, never crashes, still finds an already-reachable CLI", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "grok", `process.stdout.write("Available models:\\n  - grok-4.7\\n");`);
    const catalog = createModelCatalog({ env: { ...bin.env, SHELL: "/definitely/not/a/real/shell" }, platform: "darwin" });
    const result = await catalog.listBotModels("grok");
    assert.equal(result.source, "installed-cli", "the probe failing must not take down an already-working inherited-PATH lookup");
    assert.deepEqual(result.models, [{ id: "grok-4.7", label: "grok-4.7" }]);
  } finally {
    bin.cleanup();
  }
});

test("darwin: the login shell probe runs at most once per catalog, shared across different kinds", async () => {
  const bin = makeFixtureBin();
  const shellDir = mkdtempSync(join(tmpdir(), "hb-model-shell-"));
  const probeLog = join(shellDir, "probe-invocations.log");
  try {
    writeBin(bin.dir, "grok", `process.stdout.write("Available models:\\n  - grok-4.7\\n");`);
    writeBin(bin.dir, "opencode", `process.stdout.write("opencode/big-pickle\\n");`);
    writeBin(
      shellDir,
      "fake-login-shell",
      `
require("node:fs").appendFileSync(${JSON.stringify(probeLog)}, "x");
process.stdout.write("\\n__HB_PATH__" + ${JSON.stringify(bin.dir)} + "\\n");
`,
    );
    const catalog = createModelCatalog({
      env: { PATH: process.env.PATH ?? "", SHELL: join(shellDir, "fake-login-shell") },
      platform: "darwin",
    });
    await catalog.listBotModels("grok");
    await catalog.listBotModels("opencode");
    await catalog.listBotModels("grok"); // within TTL, served from cache, no new query at all
    assert.equal(readFileSync(probeLog, "utf8"), "x", "the login shell probe must be memoized, not re-run per kind or per call");
  } finally {
    bin.cleanup();
    rmSync(shellDir, { recursive: true, force: true });
  }
});

test("cache: a cold call queries the CLI once; a repeat call within the TTL reuses it without spawning again", async () => {
  const bin = makeFixtureBin();
  const logPath = join(bin.dir, "invocations.log");
  try {
    writeBin(bin.dir, "grok", `require("node:fs").appendFileSync(${JSON.stringify(logPath)}, "x"); process.stdout.write("Available models:\\n  - grok-4.7\\n");`);
    let now = 1_000_000;
    const catalog = createModelCatalog({ env: bin.env, now: () => now, platform: "linux" });
    await catalog.listBotModels("grok");
    assert.equal(readFileSync(logPath, "utf8"), "x");
    now += 60_000; // well under the 5-minute TTL
    const second = await catalog.listBotModels("grok");
    assert.equal(readFileSync(logPath, "utf8"), "x", "a fresh cache entry must not trigger a second spawn");
    assert.deepEqual(second.models, [{ id: "grok-4.7", label: "grok-4.7" }]);
  } finally {
    bin.cleanup();
  }
});

test("cache: past the TTL, a call returns the stale cached result immediately and refreshes in the background", async () => {
  const bin = makeFixtureBin();
  const logPath = join(bin.dir, "invocations.log");
  try {
    writeBin(
      bin.dir,
      "grok",
      `
const fs = require("node:fs");
const path = ${JSON.stringify(logPath)};
const count = fs.existsSync(path) ? fs.readFileSync(path, "utf8").length : 0;
fs.appendFileSync(path, "x");
process.stdout.write(count === 0 ? "Available models:\\n  - grok-4.7\\n" : "Available models:\\n  - grok-4.8\\n");
`,
    );
    let now = 1_000_000;
    const ttlMs = 1000;
    const catalog = createModelCatalog({ env: bin.env, now: () => now, ttlMs, platform: "linux" });
    const first = await catalog.listBotModels("grok");
    assert.deepEqual(first.models, [{ id: "grok-4.7", label: "grok-4.7" }]);
    now += ttlMs + 1;
    const stale = await catalog.listBotModels("grok");
    assert.deepEqual(stale.models, [{ id: "grok-4.7", label: "grok-4.7" }], "the aged-out call must still return the last known list immediately");
    // Let the background refresh (a real child process, then a cache write) finish, then the next
    // call sees the new list. Polled against the actual cached value -- not a fixed sleep, which is
    // calibrated for an idle machine and flakes under full-suite parallel load, and not just the
    // fixture's own log file, whose write lands before the cache update it triggers actually does.
    const refreshed = await waitForModels(catalog, "grok", [{ id: "grok-4.8", label: "grok-4.8" }]);
    assert.equal(refreshed.source, "installed-cli");
    assert.equal(readFileSync(logPath, "utf8").length, 2, "exactly one background refresh should have run, not one per stale call");
  } finally {
    bin.cleanup();
  }
});

test("the default listBotModels export resolves claude's aliases (smoke test of the module-level singleton)", async () => {
  const result = await listBotModels("claude");
  assert.equal(result.source, "latest-alias");
  assert.ok(result.models.some((m) => m.id === "opus"));
});
