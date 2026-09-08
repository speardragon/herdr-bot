import { test } from "node:test";
import assert from "node:assert/strict";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { HerdrError } from "../src/herdr/types.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

const idleAgent = { name: "reviewer", agent: "claude", agent_status: "idle" as const, pane_id: "w1:p2", tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp", agent_session: { value: "s1" } };

test("agentList projects agents and agentGet resolves by name or pane", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [idleAgent], workspaces: [{ workspace_id: "w1", label: "x" }] });
    const cli = createHerdrCli(fake.binPath, fake.env);
    const agents = await cli.agentList();
    assert.equal(agents[0]?.name, "reviewer");
    assert.equal(agents[0]?.agent_session?.value, "s1");
    assert.equal((await cli.agentGet("w1:p2")).name, "reviewer");
    await assert.rejects(cli.agentGet("ghost"), (error: unknown) => error instanceof HerdrError && error.code === "agent_not_found");
  } finally {
    temp.cleanup();
  }
});

test("agentStart passes kind, pane, and agent args after --", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [{ workspace_id: "w1", label: "x" }] });
    const cli = createHerdrCli(fake.binPath, fake.env);
    const started = await cli.agentStart({ name: "fixer", kind: "claude", paneId: "w1:p3", agentArgs: ["--permission-mode", "bypassPermissions"], timeoutMs: 45_000 });
    assert.equal(started.name, "fixer");
    const call = fake.readLog().at(-1)!;
    assert.deepEqual(call, ["agent", "start", "fixer", "--kind", "claude", "--pane", "w1:p3", "--timeout", "45000", "--", "--permission-mode", "bypassPermissions"]);
  } finally {
    temp.cleanup();
  }
});

test("agentPrompt maps herdr error codes and returns the settled agent", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [idleAgent, { ...idleAgent, name: "stuck", pane_id: "w1:p9", agent_status: "blocked" }], workspaces: [], onPrompt: { reviewer: { finalStatus: "idle" } } });
    const cli = createHerdrCli(fake.binPath, fake.env);
    const settled = await cli.agentPrompt({ target: "reviewer", text: "hello\nworld", wait: true, timeoutMs: 1_000 });
    assert.equal(settled?.agent_status, "idle");
    assert.deepEqual(fake.readLog().at(-1), ["agent", "prompt", "reviewer", "hello\nworld", "--wait", "--timeout", "1000"]);
    await assert.rejects(cli.agentPrompt({ target: "stuck", text: "x", wait: true }), (error: unknown) => error instanceof HerdrError && error.code === "agent_blocked");
    fake.writeState({ ...fake.readState(), onPrompt: { reviewer: { finalStatus: "stalled" } } });
    await assert.rejects(cli.agentPrompt({ target: "reviewer", text: "x", wait: true }), (error: unknown) => error instanceof HerdrError && error.code === "agent_prompt_stalled");
  } finally {
    temp.cleanup();
  }
});

test("workspace/tab/pane helpers return ids from the json result", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home);
    const cli = createHerdrCli(fake.binPath, fake.env);
    const workspace = await cli.workspaceCreate({ cwd: "/tmp/repo", label: "herdr-bot: repo" });
    assert.equal(workspace.workspaceId, "w1");
    assert.equal(workspace.rootPaneId, "w1:p1");
    const tab = await cli.tabCreate({ workspaceId: "w1", cwd: "/tmp/repo", label: "fixer" });
    assert.equal(tab.rootPaneId, "w1:p100");
    assert.deepEqual((await cli.workspaceList()).map((ws) => ws.workspace_id), ["w1"]);
    await cli.paneClose("w1:p100");
    assert.deepEqual(fake.readState().closedPanes, ["w1:p100"]);
    await assert.rejects(cli.agentRename("w1:p1", null), (error: unknown) => error instanceof HerdrError && error.code === "agent_not_found");
    assert.deepEqual(fake.readLog().at(-1), ["agent", "rename", "w1:p1", "--clear"]);
    await cli.notify("t", "b");
  } finally {
    temp.cleanup();
  }
});

test("a missing binary surfaces as herdr_spawn_failed", async () => {
  const cli = createHerdrCli("/definitely/not/herdr", {});
  await assert.rejects(cli.agentList(), (error: unknown) => error instanceof HerdrError && error.code === "herdr_spawn_failed");
});
