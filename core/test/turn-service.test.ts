import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { resolveConfig } from "../src/config.ts";
import { HostEvents } from "../src/host-events.ts";
import { SayInbox } from "../src/bots/say-inbox.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { ChatService } from "../src/services/chat-service.ts";
import { RosterService } from "../src/services/roster-service.ts";
import { RunQueue } from "../src/services/run-queue.ts";
import { TurnService } from "../src/services/turn-service.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { RoomStore } from "../src/store/room-store.ts";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import { startControlServer } from "../src/control/server.ts";
import { ControlError } from "../src/control/protocol.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";

const agent = (name: string, status: "idle" | "working" | "blocked" = "idle") => ({ name, agent: "claude", agent_status: status, pane_id: `w1:p-${name}`, tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" });

async function harness(state: FakeHerdrState) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_TURN_TIMEOUT_MS: "5000" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  for (const a of state.agents) profiles.save(sampleProfile({ id: a.name ?? "x", name: (a.name ?? "x").toUpperCase(), herdr: { paneId: a.pane_id, workspaceId: "w1", sessionId: null } }));
  rooms.save(sampleRoom({ id: "room-1", memberIds: state.agents.map((a) => a.name ?? "") }));
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  await mirror.refresh();
  const events = new HostEvents();
  const runQueue = new RunQueue();
  const inbox = new SayInbox();
  let turns: TurnService | null = null;
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: (id) => turns?.isTurnActive(id) ?? false });
  const roster = new RosterService({ config, profiles, rooms, cli, mirror });
  turns = new TurnService({ config, roster, chat, runQueue, cli, mirror, inbox });
  const server = await startControlServer(join(temp.home, "host.sock"), async (method, params) => {
    if (method === "say") return turns!.handleSay(String(params.paneId), String(params.chatId), String(params.text));
    throw new ControlError("unknown_method", method);
  });
  return { temp, fake, chat, turns, cleanup: async () => { await server.close(); temp.cleanup(); } };
}

test("a user message runs a full room turn: every member speaks, replies land in the transcript with authors", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [], onPrompt: { a: { say: ["a says hi"], sayOnce: true }, b: { say: ["b says hi"], sayOnce: true } } });
  try {
    h.chat.appendUser("room-1", { content: "hello everyone" });
    await h.turns.schedule("room-1");
    const texts = h.chat.transcript("room-1").readAll().map((e) => `${(e.author as { id: string } | undefined)?.id ?? "-"}:${e.kind}`);
    assert.deepEqual(texts.slice(0, 3), ["user:message", "a:send-message", "b:send-message"]);
    const prompts = h.fake.readState().prompts ?? [];
    assert.match(prompts[0]!.text, /\[herdr-bot room "auth" - with B\]/);
    assert.match(prompts[0]!.text, /ray \(user\): hello everyone/);
    assert.match(prompts[1]!.text, /A: a says hi/);
  } finally {
    await h.cleanup();
  }
});

test("mentions limit responders, busy bots get a notice, and DM turns run a single round", async () => {
  const h = await harness({ agents: [agent("a"), agent("b", "working")], workspaces: [], onPrompt: { a: { say: ["only me"], sayOnce: true } } });
  try {
    h.chat.appendUser("room-1", { content: "@a please" });
    await h.turns.schedule("room-1");
    const kinds = h.chat.transcript("room-1").readAll().map((e) => e.kind);
    assert.deepEqual(kinds, ["message", "send-message"]);
    h.chat.appendUser("room-1", { content: "@b you too" });
    await h.turns.schedule("room-1");
    const notice = h.chat.transcript("room-1").readAll().find((e) => e.kind === "notice");
    assert.match(String(notice?.content), /B is busy/);
    h.chat.appendUser("a", { content: "dm hi" });
    await h.turns.schedule("a");
    const dm = h.fake.readState().prompts?.find((p) => /\[herdr-bot DM\]/.test(p.text));
    assert.ok(dm);
    assert.match(dm!.text, /say a "/);
  } finally {
    await h.cleanup();
  }
});

test("handleSay enforces pane identity and membership; late says are appended", async () => {
  const h = await harness({ agents: [agent("a")], workspaces: [] });
  try {
    assert.throws(() => h.turns.handleSay("w9:p9", "room-1", "x"), (e: unknown) => e instanceof ControlError && e.code === "unknown_pane");
    assert.throws(() => h.turns.handleSay("w1:p-a", "room-other", "x"), (e: unknown) => e instanceof ControlError && e.code === "unknown_chat");
    const late = h.turns.handleSay("w1:p-a", "room-1", "late thought");
    assert.equal(late.mode, "late");
    assert.equal(h.chat.transcript("room-1").last()?.kind, "send-message");
  } finally {
    await h.cleanup();
  }
});
