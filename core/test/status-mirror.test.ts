import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { setLogSink } from "../src/log.ts";
import type { BotRuntime } from "../src/herdr/types.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { startFakeHerdrSocket } from "./helpers/fake-herdr-socket.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { waitFor } from "./helpers/wait-for.ts";
import { parseBlockedPrompt } from "../src/herdr/blocked-prompt.ts";
import { ASK_MULTI_SELECT_SCREEN, ASK_REVIEW_SCREEN, ASK_SINGLE_SCREEN, BASH_PERMISSION_SCREEN } from "./helpers/prompt-screens.ts";

const agent = (name: string, status: "idle" | "working" | "blocked", pane: string) => ({ name, agent: "claude", agent_status: status, pane_id: pane, tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" });

async function settle(ms = 300): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("refresh mirrors named agents, marks unknown bots offline, and reports changes", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [agent("reviewer", "idle", "w1:p2")], workspaces: [] });
    const changes: string[] = [];
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: null,
      botIds: () => ["reviewer", "ghost"],
      onChange: (botId, runtime: BotRuntime, previous) => changes.push(`${botId}:${previous.status}->${runtime.status}`),
    });
    await mirror.refresh();
    assert.equal(mirror.get("reviewer").status, "idle");
    assert.equal(mirror.get("reviewer").paneId, "w1:p2");
    assert.equal(mirror.get("ghost").status, "offline");
    assert.deepEqual(changes, ["reviewer:offline->idle"]);
    fake.writeState({ ...fake.readState(), agents: [agent("reviewer", "working", "w1:p2")] });
    await mirror.refresh();
    assert.deepEqual(changes, ["reviewer:offline->idle", "reviewer:idle->working"]);
    await mirror.refresh();
    assert.equal(changes.length, 2);
  } finally {
    temp.cleanup();
  }
});

test("socket events trigger a debounced refresh and per-pane subscriptions follow bot panes", async () => {
  const temp = makeTempHome();
  const socket = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  try {
    const fake = installFakeHerdr(temp.home, { agents: [agent("reviewer", "idle", "w1:p2")], workspaces: [] });
    const changes: string[] = [];
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: socket.path,
      botIds: () => ["reviewer"],
      onChange: (botId, runtime) => changes.push(`${botId}:${runtime.status}`),
      pollIntervalMs: 60_000,
      debounceMs: 20,
    });
    mirror.start();
    // start() subscribes globally-only before the first refresh() resolves; wait past that for the
    // pane-aware resubscribe the refresh triggers once it has learned reviewer's pane.
    await waitFor(
      () => changes.length >= 1 && socket.subscriptions.some((s) => s.some((sub) => sub.pane_id === "w1:p2")),
      { message: `expected a pane-scoped subscription for w1:p2, got: ${JSON.stringify(socket.subscriptions)}` },
    );
    assert.deepEqual(changes, ["reviewer:idle"]);
    const subscription = socket.subscriptions.at(-1)!;
    assert.ok(subscription.some((s) => s.type === "pane.updated"));
    assert.ok(subscription.some((s) => s.type === "pane.agent_status_changed" && s.pane_id === "w1:p2"), JSON.stringify(subscription));
    fake.writeState({ ...fake.readState(), agents: [agent("reviewer", "blocked", "w1:p2")] });
    socket.push("pane.agent_status_changed", { pane_id: "w1:p2", agent_status: "blocked" });
    await waitFor(() => changes.length >= 2);
    assert.deepEqual(changes, ["reviewer:idle", "reviewer:blocked"]);
    mirror.stop();
    await mirror.refresh(); // drain any in-flight/orphan `agent list` child before temp.cleanup() removes its state file
  } finally {
    await socket.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("a poll cannot bypass the reconnect gate; the clock, not the poll, unlocks the next attempt", async () => {
  const temp = makeTempHome();
  const socket = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  socket.holdHandshake = true;
  try {
    const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [] });
    let clock = 0;
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: socket.path,
      botIds: () => [],
      onChange: () => undefined,
      pollIntervalMs: 60_000,
      debounceMs: 10,
      resubscribeMs: 15,
      handshakeTimeoutMs: 15,
      now: () => clock,
    });
    mirror.start();
    await mirror.refresh();
    await waitFor(() => socket.subscriptions.length >= 1);
    assert.equal(socket.subscriptions.length, 1);
    for (const at of [5_000, 10_000, 29_999]) {
      clock = at;
      await mirror.refresh();
      await settle(40);
      assert.equal(socket.subscriptions.length, 1, `no reconnect attempt should happen at t=${at}`);
    }
    clock = 30_000;
    await mirror.refresh();
    await waitFor(() => socket.subscriptions.length >= 2);
    assert.equal(socket.subscriptions.length, 2);
    mirror.stop();
    await mirror.refresh(); // drain any in-flight/orphan `agent list` child before temp.cleanup() removes its state file
  } finally {
    await socket.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("a global-only reconnect success does not merge the next same-code transport close into the previous one's dedup state", async () => {
  const temp = makeTempHome();
  const socket = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  socket.holdHandshake = true;
  const lines: string[] = [];
  setLogSink((line) => lines.push(line));
  try {
    const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [] });
    let clock = 0;
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: socket.path,
      botIds: () => [],
      onChange: () => undefined,
      pollIntervalMs: 60_000,
      debounceMs: 10,
      resubscribeMs: 15,
      handshakeTimeoutMs: 15,
      now: () => clock,
    });
    mirror.start();
    await mirror.refresh();
    // First transport failure (handshake timeout): a fresh transition, must warn.
    await waitFor(() => lines.filter((l) => l.includes("herdr subscription handshake timed out")).length >= 1);
    assert.equal(lines.filter((l) => l.includes("herdr subscription handshake timed out")).length, 1);

    // The gate opens and this reconnect succeeds without any panes (global-only) -- the steady-state
    // this task targets. A successful reconnect must reset the "same error" dedup state even though
    // it never touched the pane-probe path.
    clock = 30_000;
    socket.holdHandshake = false;
    await mirror.refresh();
    await waitFor(() => socket.subscriptions.length >= 2);
    await settle(50); // let the (already-sent) handshake ack round-trip over the loopback socket

    // Drop the now-live connection and let the mirror's own backoff bring it back down, hanging again.
    socket.dropClients();
    await settle(50);
    clock = 60_000;
    socket.holdHandshake = true;
    await mirror.refresh();

    // Second transport failure carries the SAME code ("handshake_timeout") as the first. Because a
    // successful connect happened in between, this must be treated as a fresh transition and warn again,
    // not be silently merged into the first occurrence's repeat count.
    await waitFor(() => lines.filter((l) => l.includes("herdr subscription handshake timed out")).length >= 2, { message: `expected both handshake-timeout closes to warn independently, got: ${JSON.stringify(lines)}` });
    assert.equal(lines.filter((l) => l.includes("herdr subscription handshake timed out")).length, 2, `expected both handshake-timeout closes to warn independently, got: ${JSON.stringify(lines)}`);

    mirror.stop();
    await mirror.refresh(); // drain any in-flight/orphan `agent list` child before temp.cleanup() removes its state file
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await socket.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("a second start() call is a no-op: no duplicate poll, resubscribe, or timers", async () => {
  const temp = makeTempHome();
  const socket = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  try {
    const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [] });
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: socket.path,
      botIds: () => [],
      onChange: () => undefined,
      pollIntervalMs: 60_000,
      debounceMs: 10,
    });
    mirror.start();
    mirror.start();
    mirror.start();
    await waitFor(() => socket.subscriptions.length >= 1 && fake.readLog().length >= 1);
    await settle(300); // give a would-be duplicate resubscribe/refresh a window to show up before asserting its absence
    assert.equal(socket.subscriptions.length, 1, "duplicate start() must not trigger extra resubscribe attempts");
    assert.equal(fake.readLog().length, 1, "duplicate start() must not trigger extra initial refreshes/poll timers");
    mirror.stop();
    await mirror.refresh(); // drain any in-flight/orphan `agent list` child before temp.cleanup() removes its state file
  } finally {
    await socket.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("pane_not_found falls back to a global-only subscription and gates pane recovery separately from transport backoff", async () => {
  const temp = makeTempHome();
  const socket = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  socket.missingPanes.add("w1:p2");
  const lines: string[] = [];
  setLogSink((line) => lines.push(line));
  try {
    const fake = installFakeHerdr(temp.home, { agents: [{ name: "reviewer", agent: "claude", agent_status: "idle", pane_id: "w1:p2", tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" }], workspaces: [] });
    let clock = 0;
    const changes: string[] = [];
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: socket.path,
      botIds: () => ["reviewer"],
      onChange: (botId, runtime) => changes.push(`${botId}:${runtime.status}`),
      pollIntervalMs: 60_000,
      debounceMs: 10,
      resubscribeMs: 30_000,
      now: () => clock,
    });
    mirror.start();
    await mirror.refresh();
    // A pane-scoped attempt was made and rejected, and the mirror settled on a global-only subscription.
    await waitFor(
      () => socket.subscriptions.some((s) => s.some((sub) => sub.pane_id === "w1:p2")) && socket.subscriptions.at(-1)?.every((s) => s.pane_id == null) === true,
      { message: `expected a rejected pane-scoped attempt followed by a global-only fallback, got: ${JSON.stringify(socket.subscriptions)}` },
    );
    assert.ok(socket.subscriptions.some((s) => s.some((sub) => sub.pane_id === "w1:p2")), "should have attempted the pane subscription at least once");
    assert.ok(socket.subscriptions.at(-1)?.every((s) => s.pane_id == null), "should have fallen back to global-only");

    // The global-only subscription still delivers lifecycle events, so bots are not left stuck polling blind.
    fake.writeState({ ...fake.readState(), agents: [{ name: "reviewer", agent: "claude", agent_status: "working", pane_id: "w1:p2", tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" }] });
    socket.push("pane.updated", { pane_id: "w1:p2" });
    await waitFor(() => changes.includes("reviewer:working"), { message: `expected "reviewer:working" among changes, got: ${JSON.stringify(changes)}` });
    assert.ok(changes.includes("reviewer:working"));

    // The pane-recovery probe is on its own 30/60/120s gate; refreshes before it elapses must not retry the pane subscription.
    const afterFallback = socket.subscriptions.length;
    for (const at of [5_000, 10_000, 29_999]) {
      clock = at;
      await mirror.refresh();
      await settle(30);
      assert.equal(socket.subscriptions.length, afterFallback, `no pane probe should fire at t=${at}`);
    }
    clock = 30_000;
    await mirror.refresh();
    // The probe fires (rejected again) and falls back to global-only once more.
    await waitFor(
      () => socket.subscriptions.length > afterFallback && socket.subscriptions.at(-1)?.every((s) => s.pane_id == null) === true,
      { message: "the 30s probe gate should have allowed a new pane attempt, followed by a fallback to global-only" },
    );
    assert.ok(socket.subscriptions.length > afterFallback, "the 30s probe gate should have allowed a new pane attempt");
    const afterProbe = socket.subscriptions.length;
    assert.ok(socket.subscriptions.at(-1)?.every((s) => s.pane_id == null));

    // A global-only reconnect succeeding must NOT reset the pane probe's own backoff (30 -> 60s next).
    clock = 40_000;
    await mirror.refresh();
    await settle(30);
    assert.equal(socket.subscriptions.length, afterProbe, "probe backoff must have advanced to 60s, independent of the healthy global connection");

    clock = 90_000;
    socket.missingPanes.delete("w1:p2");
    await mirror.refresh();
    // The 90s probe now succeeds because the pane is no longer missing.
    await waitFor(() => socket.subscriptions.length > afterProbe && socket.subscriptions.at(-1)?.some((s) => s.pane_id === "w1:p2") === true);
    assert.ok(socket.subscriptions.length > afterProbe);
    assert.ok(socket.subscriptions.at(-1)?.some((s) => s.pane_id === "w1:p2"));

    // The pane stayed missing across both attempts (the initial one and the 30s probe), and the
    // global-only reconnect in between is a fallback, not a recovery -- so the rejection is reported
    // once and the probe that repeats it is counted instead of reprinted. Recovery (the pane
    // subscription actually succeeding) then logs exactly once, carrying that count.
    await waitFor(() => lines.filter((line) => line.includes("recovered")).length >= 1, { message: `expected a "recovered" log line, got: ${JSON.stringify(lines)}` });
    const rejectionLines = lines.filter((line) => line.includes("pane w1:p2 not found"));
    assert.equal(rejectionLines.length, 1, `a pane that is still missing must not reprint every probe, got: ${JSON.stringify(lines)}`);
    assert.equal(lines.filter((line) => line.includes("recovered")).length, 1);
    assert.match(lines.find((line) => line.includes("recovered"))!, /"suppressedRepeats":1/);

    mirror.stop();
    await mirror.refresh(); // drain any in-flight/orphan `agent list` child before temp.cleanup() removes its state file
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await socket.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("a stale connection's close does not clobber a newer one, and stop() silences all pending callbacks", async () => {
  const temp = makeTempHome();
  const socket = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  try {
    const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [] });
    const changes: string[] = [];
    let clock = 0;
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: socket.path,
      botIds: () => [],
      onChange: () => changes.push("change"),
      pollIntervalMs: 60_000,
      debounceMs: 10,
      resubscribeMs: 15,
      now: () => clock,
    });
    mirror.start();
    await mirror.refresh();
    await waitFor(() => socket.subscriptions.length >= 1);
    const initial = socket.subscriptions.length;
    socket.dropClients();
    await settle(50);
    // The drop backs off the transport gate; a poll before it elapses must not reconnect yet.
    assert.equal(socket.subscriptions.length, initial, "should not reconnect before the backoff elapses");
    clock = 30_000;
    await mirror.refresh();
    // The mirror reconnects once the gate opens.
    await waitFor(() => socket.subscriptions.length >= initial + 1);
    assert.equal(socket.subscriptions.length, initial + 1);
    socket.push("pane.updated", { pane_id: "w9:p9" });
    await settle(80);
    // The new connection is still live and receiving events, i.e. the earlier stale close did not null it out.
    assert.equal(socket.subscriptions.length, initial + 1);

    mirror.stop();
    await mirror.refresh(); // drain any in-flight/orphan `agent list` child before temp.cleanup() removes its state file
    const subscriptionsAtStop = socket.subscriptions.length;
    socket.push("pane.updated", { pane_id: "w9:p9" });
    socket.dropClients();
    await settle(80);
    assert.equal(socket.subscriptions.length, subscriptionsAtStop, "stop() must leave no reconnect timers behind");
  } finally {
    await socket.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("a blocked bot's prompt is read, parsed, published with the status change, and cleared when it unblocks", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [agent("reviewer", "idle", "w1:p2")], workspaces: [] });
    const cli = createHerdrCli(fake.binPath, fake.env);
    const changes: { status: string; prompt: string | null }[] = [];
    let suppressed = false;
    const mirror = new StatusMirror({
      cli,
      socketPath: null,
      botIds: () => ["reviewer"],
      onChange: (_botId, runtime) => changes.push({ status: runtime.status, prompt: runtime.prompt?.question ?? null }),
      readPrompt: (botId) => cli.agentRead(botId, 80, "detection").then(parseBlockedPrompt),
      isPromptReadSuppressed: () => suppressed,
    });
    await mirror.refresh();
    assert.equal(mirror.get("reviewer").prompt, null);

    fake.writeState({ ...fake.readState(), agents: [agent("reviewer", "blocked", "w1:p2")], screens: { reviewer: ASK_SINGLE_SCREEN } });
    await mirror.refresh();
    const blocked = mirror.get("reviewer");
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.prompt?.kind, "question");
    assert.equal(blocked.prompt?.question, "Which color do you prefer?");
    // The change event already carries the prompt: no blocked-without-card flash.
    assert.deepEqual(changes.at(-1), { status: "blocked", prompt: "Which color do you prefer?" });

    // Same status, next question of the same form -> a new change (the card must follow the pane).
    fake.writeState({ ...fake.readState(), screens: { reviewer: ASK_MULTI_SELECT_SCREEN } });
    await mirror.refresh();
    assert.deepEqual(changes.at(-1), { status: "blocked", prompt: "Which toppings?" });
    const changeCount = changes.length;
    await mirror.refresh();
    assert.equal(changes.length, changeCount, "an unchanged screen is not re-published");

    // While an answer is being typed the previous prompt is kept instead of re-reading the half-edited screen.
    suppressed = true;
    fake.writeState({ ...fake.readState(), screens: { reviewer: ASK_REVIEW_SCREEN } });
    await mirror.refresh();
    assert.equal(mirror.get("reviewer").prompt?.question, "Which toppings?");
    suppressed = false;
    await mirror.refresh();
    assert.equal(mirror.get("reviewer").prompt?.question, "Ready to submit your answers?");

    fake.writeState({ ...fake.readState(), agents: [agent("reviewer", "working", "w1:p2")] });
    await mirror.refresh();
    assert.deepEqual(changes.at(-1), { status: "working", prompt: null });
    assert.equal(mirror.get("reviewer").prompt, null);
  } finally {
    temp.cleanup();
  }
});

test("a failed screen read keeps the previous prompt and does not abort the refresh", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [agent("reviewer", "blocked", "w1:p2")], workspaces: [], screens: { reviewer: BASH_PERMISSION_SCREEN } });
    const cli = createHerdrCli(fake.binPath, fake.env);
    let failReads = false;
    const mirror = new StatusMirror({
      cli,
      socketPath: null,
      botIds: () => ["reviewer"],
      onChange: () => undefined,
      readPrompt: (botId) => failReads ? Promise.reject(new Error("pane went away")) : cli.agentRead(botId, 80, "detection").then(parseBlockedPrompt),
    });
    await mirror.refresh();
    assert.equal(mirror.get("reviewer").prompt?.kind, "permission");
    failReads = true;
    await mirror.refresh();
    assert.equal(mirror.get("reviewer").status, "blocked");
    assert.equal(mirror.get("reviewer").prompt?.kind, "permission");
  } finally {
    temp.cleanup();
  }
});

// A pane herdr no longer knows (its window was closed, or the app is pointed at the wrong session)
// fails every probe cycle forever. The global-only subscription that succeeds in between each probe
// is NOT a recovery, so it must not reset the "already reported this" memory -- otherwise the same
// "pane <id> not found" line prints every couple of minutes for as long as the app runs.
test("a pane that stays missing is reported once, then counted silently until pane subscriptions recover", async () => {
  const temp = makeTempHome();
  const socket = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  const lines: string[] = [];
  setLogSink((line) => lines.push(line));
  try {
    const fake = installFakeHerdr(temp.home, { agents: [agent("reviewer", "idle", "w5:p1")], workspaces: [] });
    socket.missingPanes.add("w5:p1");
    let clock = 0;
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: socket.path,
      botIds: () => ["reviewer"],
      onChange: () => undefined,
      pollIntervalMs: 60_000,
      debounceMs: 10,
      resubscribeMs: 15,
      now: () => clock,
    });
    mirror.start();
    await mirror.refresh();
    const notFound = () => lines.filter((line) => line.includes("w5:p1 not found"));
    await waitFor(() => notFound().length >= 1, { message: `expected the first pane_not_found to be reported, got: ${JSON.stringify(lines)}` });
    assert.equal(notFound().length, 1);

    // Drive several more probe cycles: each one fails the same way with a successful global-only
    // subscription in between. None of them may add another line.
    for (const at of [130_000, 260_000, 390_000]) {
      clock = at;
      await mirror.refresh();
      await settle(60);
    }
    assert.ok(socket.subscriptions.filter((subs) => subs.some((sub) => sub.pane_id === "w5:p1")).length >= 2, "the mirror must keep probing the pane");
    assert.equal(notFound().length, 1, `a still-missing pane must not keep logging, got: ${JSON.stringify(lines)}`);

    // Once the pane is back, one "recovered" line closes it out and carries how many were suppressed.
    socket.missingPanes.delete("w5:p1");
    clock = 520_000;
    await mirror.refresh();
    await waitFor(() => lines.some((line) => line.includes("pane subscriptions recovered")), { message: `expected a recovery line, got: ${JSON.stringify(lines)}` });
    assert.match(lines.find((line) => line.includes("pane subscriptions recovered"))!, /"suppressedRepeats":[1-9]/);

    // And a later disappearance is a fresh transition that reports again.
    socket.missingPanes.add("w5:p1");
    socket.dropClients();
    await settle(50); // the drop is observed a tick later; advance the clock only once it has landed
    clock = 650_000;
    await mirror.refresh();
    await waitFor(() => notFound().length >= 2, { message: `expected a fresh report after recovery, got lines ${JSON.stringify(lines)} subs ${JSON.stringify(socket.subscriptions.slice(-4))}` });

    mirror.stop();
    await mirror.refresh();
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await socket.close().catch(() => undefined);
    temp.cleanup();
  }
});
