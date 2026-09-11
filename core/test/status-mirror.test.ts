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
    await settle();
    assert.deepEqual(changes, ["reviewer:idle"]);
    const subscription = socket.subscriptions.at(-1)!;
    assert.ok(subscription.some((s) => s.type === "pane.updated"));
    assert.ok(subscription.some((s) => s.type === "pane.agent_status_changed" && s.pane_id === "w1:p2"), JSON.stringify(subscription));
    fake.writeState({ ...fake.readState(), agents: [agent("reviewer", "blocked", "w1:p2")] });
    socket.push("pane.agent_status_changed", { pane_id: "w1:p2", agent_status: "blocked" });
    await settle();
    assert.deepEqual(changes, ["reviewer:idle", "reviewer:blocked"]);
    mirror.stop();
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
    await settle(50);
    assert.equal(socket.subscriptions.length, 1);
    for (const at of [5_000, 10_000, 29_999]) {
      clock = at;
      await mirror.refresh();
      await settle(40);
      assert.equal(socket.subscriptions.length, 1, `no reconnect attempt should happen at t=${at}`);
    }
    clock = 30_000;
    await mirror.refresh();
    await settle(80);
    assert.equal(socket.subscriptions.length, 2);
    mirror.stop();
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
    await settle(80);
    // A pane-scoped attempt was made and rejected, and the mirror settled on a global-only subscription.
    assert.ok(socket.subscriptions.some((s) => s.some((sub) => sub.pane_id === "w1:p2")), "should have attempted the pane subscription at least once");
    assert.ok(socket.subscriptions.at(-1)?.every((s) => s.pane_id == null), "should have fallen back to global-only");

    // The global-only subscription still delivers lifecycle events, so bots are not left stuck polling blind.
    fake.writeState({ ...fake.readState(), agents: [{ name: "reviewer", agent: "claude", agent_status: "working", pane_id: "w1:p2", tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" }] });
    socket.push("pane.updated", { pane_id: "w1:p2" });
    await settle(80);
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
    await settle(80);
    // The probe fires (rejected again) and falls back to global-only once more.
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
    await settle(80);
    // The 90s probe now succeeds because the pane is no longer missing.
    assert.ok(socket.subscriptions.length > afterProbe);
    assert.ok(socket.subscriptions.at(-1)?.some((s) => s.pane_id === "w1:p2"));

    // The repeated "pane w1:p2 not found" close (two rejections across the initial attempt and the 30s probe)
    // must log only once, not once per rejection; recovery logs exactly once too.
    const rejectionLines = lines.filter((line) => line.includes("pane w1:p2 not found"));
    assert.equal(rejectionLines.length, 1, `expected exactly one warn line for the repeated rejection, got: ${JSON.stringify(lines)}`);
    assert.equal(lines.filter((line) => line.includes("recovered")).length, 1);

    mirror.stop();
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
    await settle(50);
    const initial = socket.subscriptions.length;
    socket.dropClients();
    await settle(50);
    // The drop backs off the transport gate; a poll before it elapses must not reconnect yet.
    assert.equal(socket.subscriptions.length, initial, "should not reconnect before the backoff elapses");
    clock = 30_000;
    await mirror.refresh();
    await settle(80);
    // The mirror reconnects once the gate opens.
    assert.equal(socket.subscriptions.length, initial + 1);
    socket.push("pane.updated", { pane_id: "w9:p9" });
    await settle(80);
    // The new connection is still live and receiving events, i.e. the earlier stale close did not null it out.
    assert.equal(socket.subscriptions.length, initial + 1);

    mirror.stop();
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
