import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SayInbox } from "../src/bots/say-inbox.ts";
import { runBotTurn } from "../src/bots/turn-runner.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { startControlServer } from "../src/control/server.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

const agent = (name: string, status: "idle" | "working" | "blocked") => ({ name, agent: "claude", agent_status: status, pane_id: `w1:p-${name}`, tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" });

async function harness(state: FakeHerdrState) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const cli = createHerdrCli(fake.binPath, fake.env);
  const inbox = new SayInbox();
  const said: string[] = [];
  const server = await startControlServer(join(temp.home, "host.sock"), async (method, params) => {
    if (method !== "say") throw new Error(method);
    const botId = state.agents.find((a) => a.pane_id === params.paneId)?.name ?? "?";
    const mode = inbox.accept(String(params.chatId), botId, String(params.text));
    said.push(`${botId}:${mode}:${String(params.text)}`);
    return { mode };
  });
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => state.agents.map((a) => a.name ?? ""), onChange: () => undefined });
  await mirror.refresh();
  return { deps: { cli, mirror, inbox, turnTimeoutMs: 5_000 }, fake, said, cleanup: async () => { await server.close(); temp.cleanup(); } };
}

test("a settled turn returns what the bot said through the control socket", async () => {
  const h = await harness({ agents: [agent("reviewer", "idle")], workspaces: [], onPrompt: { reviewer: { say: ["looks good", "one nit"], finalStatus: "idle" } } });
  try {
    const result = await runBotTurn(h.deps, { chatId: "room-1", botId: "reviewer", prompt: `[herdr-bot room "r"] turn: /h/bin/herdr-bot say room-1 "<message>"` });
    assert.equal(result.outcome, "settled");
    assert.deepEqual(result.spoken, ["looks good", "one nit"]);
    assert.deepEqual(h.said, ["reviewer:in-turn:looks good", "reviewer:in-turn:one nit"]);
    assert.equal(h.fake.readState().prompts?.[0]?.target, "reviewer");
  } finally {
    await h.cleanup();
  }
});

test("busy, blocked, and offline bots are skipped without prompting", async () => {
  const h = await harness({ agents: [agent("busy", "working"), agent("stuck", "blocked")], workspaces: [] });
  try {
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "busy", prompt: "x" })).outcome, "busy");
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "stuck", prompt: "x" })).outcome, "blocked");
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "ghost", prompt: "x" })).outcome, "offline");
    assert.equal(h.fake.readState().prompts?.length ?? 0, 0);
  } finally {
    await h.cleanup();
  }
});

test("herdr error codes map to turn outcomes and keep anything already said", async () => {
  const h = await harness({ agents: [agent("reviewer", "idle")], workspaces: [], onPrompt: { reviewer: { say: ["partial"], finalStatus: "timeout" } } });
  try {
    const result = await runBotTurn(h.deps, { chatId: "room-1", botId: "reviewer", prompt: `[herdr-bot room "r"] x say room-1 "m"` });
    assert.equal(result.outcome, "timeout");
    assert.deepEqual(result.spoken, ["partial"]);
    h.fake.writeState({ ...h.fake.readState(), onPrompt: { reviewer: { finalStatus: "stalled" } } });
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "reviewer", prompt: "x" })).outcome, "stalled");
    h.fake.writeState({ ...h.fake.readState(), onPrompt: { reviewer: { finalStatus: "blocked" } } });
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "reviewer", prompt: "x" })).outcome, "blocked");
  } finally {
    await h.cleanup();
  }
});
