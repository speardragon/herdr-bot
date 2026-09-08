import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
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
