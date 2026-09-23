import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createModelCatalog,
  listBotModels,
  parseGrokModelsOutput,
  parseOpencodeModelsOutput,
  projectCodexModels,
} from "../src/bots/model-catalog.ts";

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
    const catalog = createModelCatalog({ env: bin.env });
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
    const catalog = createModelCatalog({ env: bin.env });
    assert.deepEqual(await catalog.listBotModels("grok"), { models: [], source: "unavailable", error: "grok models returned no models" });
  } finally {
    bin.cleanup();
  }
});

test("grok: a nonzero exit becomes unavailable", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "grok", `process.stderr.write("not logged in"); process.exit(1);`);
    const catalog = createModelCatalog({ env: bin.env });
    const result = await catalog.listBotModels("grok");
    assert.equal(result.source, "unavailable");
    assert.equal(result.error, "not logged in");
  } finally {
    bin.cleanup();
  }
});

test("grok: a CLI missing from PATH becomes unavailable", async () => {
  const catalog = createModelCatalog({ env: { PATH: "/definitely/not/a/real/path" } });
  const result = await catalog.listBotModels("grok");
  assert.equal(result.source, "unavailable");
  assert.match(result.error ?? "", /not installed/);
});

test("grok: exceeding the timeout becomes unavailable, without waiting for the full timeout", async () => {
  const bin = makeFixtureBin();
  try {
    writeBin(bin.dir, "grok", "setInterval(() => {}, 1000);"); // never exits
    const catalog = createModelCatalog({ env: bin.env, timeoutMs: 200 });
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
    const catalog = createModelCatalog({ env: bin.env });
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
    const catalog = createModelCatalog({ env: bin.env });
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
    const catalog = createModelCatalog({ env: bin.env });
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
    const catalog = createModelCatalog({ env: bin.env });
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
    const catalog = createModelCatalog({ env: bin.env });
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
    const catalog = createModelCatalog({ env: bin.env, timeoutMs: 200 });
    const started = Date.now();
    const result = await catalog.listBotModels("codex");
    assert.ok(Date.now() - started < 4000, "should not wait anywhere near the real 5s default timeout");
    assert.equal(result.source, "unavailable");
  } finally {
    bin.cleanup();
  }
});

test("cache: a cold call queries the CLI once; a repeat call within the TTL reuses it without spawning again", async () => {
  const bin = makeFixtureBin();
  const logPath = join(bin.dir, "invocations.log");
  try {
    writeBin(bin.dir, "grok", `require("node:fs").appendFileSync(${JSON.stringify(logPath)}, "x"); process.stdout.write("Available models:\\n  - grok-4.7\\n");`);
    let now = 1_000_000;
    const catalog = createModelCatalog({ env: bin.env, now: () => now });
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
    const catalog = createModelCatalog({ env: bin.env, now: () => now, ttlMs });
    const first = await catalog.listBotModels("grok");
    assert.deepEqual(first.models, [{ id: "grok-4.7", label: "grok-4.7" }]);
    now += ttlMs + 1;
    const stale = await catalog.listBotModels("grok");
    assert.deepEqual(stale.models, [{ id: "grok-4.7", label: "grok-4.7" }], "the aged-out call must still return the last known list immediately");
    // Let the background refresh (a real child process) finish, then the next call sees the new list.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const refreshed = await catalog.listBotModels("grok");
    assert.deepEqual(refreshed.models, [{ id: "grok-4.8", label: "grok-4.8" }]);
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
