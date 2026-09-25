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
import { createControlHandler } from "../src/control/handlers.ts";
import { setLogSink } from "../src/log.ts";
import type { Host } from "../src/host.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";

const agent = (name: string, status: "idle" | "working" | "blocked" = "idle") => ({ name, agent: "claude", agent_status: status, pane_id: `w1:p-${name}`, tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" });

async function harness(state: FakeHerdrState, roomMemberIds = state.agents.map((a) => a.name ?? "")) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_TURN_TIMEOUT_MS: "5000" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  for (const a of state.agents) profiles.save(sampleProfile({ id: a.name ?? "x", name: (a.name ?? "x").toUpperCase(), herdr: { paneId: a.pane_id, workspaceId: "w1", sessionId: null } }));
  rooms.save(sampleRoom({ id: "room-1", memberIds: roomMemberIds }));
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
  return { temp, fake, chat, turns, profiles, inbox, runQueue, cleanup: async () => { await server.close(); temp.cleanup(); } };
}

test("a bot can message another bot DM and wake the recipient", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] });
  try {
    const result = h.turns.handleMessage("w1:p-a", "b", "Can you inspect the parser?");
    assert.match(result.entryId, /^e\d+$/);
    const entry = h.chat.transcript("b").last();
    assert.equal(entry?.id, result.entryId);
    assert.equal((entry?.author as { id?: string } | undefined)?.id, "a");
    assert.equal((entry?.message as { content?: string } | undefined)?.content, "Can you inspect the parser?");
    await h.runQueue.enqueue("b", async () => undefined);
    assert.deepEqual(h.fake.readState().prompts?.map((prompt) => prompt.target), ["b"]);
    assert.match(h.fake.readState().prompts![0]!.text, /A: Can you inspect the parser\?/);
    h.turns.handleMessage("w1:p-b", "a", "I found it");
    await h.runQueue.enqueue("a", async () => undefined);
    assert.equal((h.chat.transcript("a").last()?.author as { id?: string } | undefined)?.id, "b");
    assert.deepEqual(h.fake.readState().prompts?.map((prompt) => prompt.target), ["b", "a"]);
  } finally {
    await h.cleanup();
  }
});

test("a message to another bot's DM records a bot-message-sent notice in the sender's own DM (no open turn), and no notice lands in the target", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] });
  try {
    h.turns.handleMessage("w1:p-a", "b", "Can you inspect the parser?");

    const sourceEntries = h.chat.transcript("a").readAll();
    assert.equal(sourceEntries.length, 1);
    assert.equal(sourceEntries[0]?.kind, "notice");
    assert.deepEqual(sourceEntries[0]?.event, { type: "bot-message-sent", targetChatId: "b", targetName: "B", targetKind: "bot" });
    assert.equal(sourceEntries[0]?.content, "메시지 보냄: B");

    const targetEntries = h.chat.transcript("b").readAll();
    assert.equal(targetEntries.length, 1);
    assert.equal(targetEntries[0]?.kind, "send-message");
  } finally {
    await h.cleanup();
  }
});

test("a message sent while a different chat's turn is open records the notice there, not in the sender's own DM", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] }, ["a"]);
  try {
    const turn = h.inbox.open("room-1", "a");
    h.turns.handleMessage("w1:p-a", "b", "found the bug");
    turn.close();

    assert.deepEqual(h.chat.transcript("room-1").readAll()[0]?.event, { type: "bot-message-sent", targetChatId: "b", targetName: "B", targetKind: "bot" });
    assert.equal(h.chat.transcript("a").readAll().length, 0);
  } finally {
    await h.cleanup();
  }
});

test("a message to a room records the notice with the room's display name and targetKind \"room\"", async () => {
  const h = await harness({ agents: [agent("a"), agent("outsider")], workspaces: [] }, ["a"]);
  try {
    h.turns.handleMessage("w1:p-a", "room-1", "status update");
    assert.deepEqual(h.chat.transcript("a").readAll()[0]?.event, { type: "bot-message-sent", targetChatId: "room-1", targetName: "auth", targetKind: "room" });
  } finally {
    await h.cleanup();
  }
});

test("a failed delivery (unknown chat, non-member, blank text) never records a bot-message-sent notice", async () => {
  const h = await harness({ agents: [agent("a"), agent("outsider")], workspaces: [] }, ["a"]);
  try {
    assert.throws(() => h.turns.handleMessage("w1:p-outsider", "room-1", "hello"),
      (error: unknown) => error instanceof ControlError && error.code === "not_a_member");
    assert.equal(h.chat.transcript("outsider").readAll().length, 0);
    assert.equal(h.chat.transcript("room-1").readAll().length, 0);
  } finally {
    await h.cleanup();
  }
});

test("a delivery that succeeds but whose source-chat notice write fails still returns the message entryId, logging instead of retrying", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] });
  try {
    setLogSink(() => undefined);
    // A turn "open" for a chat id that was never a real bot/room -- appendBotEvent on it throws
    // unknown_chat, exercising the "notice write failed" branch without touching the message delivery.
    const turn = h.inbox.open("phantom-chat", "a");
    const result = h.turns.handleMessage("w1:p-a", "b", "still gets through");
    turn.close();

    assert.match(result.entryId, /^e\d+$/);
    const targetEntries = h.chat.transcript("b").readAll();
    assert.equal(targetEntries.length, 1);
    assert.equal(targetEntries[0]?.id, result.entryId);
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await h.cleanup();
  }
});

test("room messaging requires membership and schedules the room", async () => {
  const h = await harness({ agents: [agent("a"), agent("outsider")], workspaces: [] }, ["a"]);
  try {
    assert.throws(() => h.turns.handleMessage("w1:p-outsider", "room-1", "hello"),
      (error: unknown) => error instanceof ControlError && error.code === "not_a_member");
    assert.equal(h.chat.transcript("room-1").readAll().length, 0);
    h.turns.handleMessage("w1:p-a", "room-1", "I found the issue");
    await h.runQueue.enqueue("room-1", async () => undefined);
    assert.equal((h.chat.transcript("room-1").last()?.author as { id?: string } | undefined)?.id, "a");
    assert.deepEqual(h.fake.readState().prompts?.map((prompt) => prompt.target), ["a"]);
  } finally {
    await h.cleanup();
  }
});

test("message cannot bypass the active-turn say limit", async () => {
  const h = await harness({ agents: [agent("a")], workspaces: [] });
  try {
    const turn = h.inbox.open("room-1", "a");
    assert.throws(() => h.turns.handleMessage("w1:p-a", "room-1", "third reply"),
      (error: unknown) => error instanceof ControlError && error.code === "use_say");
    assert.equal(h.chat.transcript("room-1").readAll().length, 0);
    turn.close();
  } finally {
    await h.cleanup();
  }
});

test("control message uses the supplied pane binding and rejects missing pane IDs", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] });
  try {
    const call = createControlHandler({ turns: h.turns } as Host);
    await assert.rejects(call("message", { chatId: "b", text: "forged" }),
      (error: unknown) => error instanceof ControlError && error.code === "invalid_params");
    const result = await call("message", { paneId: "w1:p-a", chatId: "b", text: "from A" }) as { entryId: string };
    assert.equal(h.chat.transcript("b").last()?.id, result.entryId);
    assert.equal((h.chat.transcript("b").last()?.author as { id?: string } | undefined)?.id, "a");
    await h.runQueue.enqueue("b", async () => undefined);
  } finally {
    await h.cleanup();
  }
});

test("message rejects unknown panes and blank text without appending", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] });
  try {
    assert.throws(() => h.turns.handleMessage("w1:p-unknown", "b", "forged"),
      (error: unknown) => error instanceof ControlError && error.code === "unknown_pane");
    assert.throws(() => h.turns.handleMessage("w1:p-a", "b", " \n "),
      (error: unknown) => error instanceof ControlError && error.code === "invalid_params");
    assert.equal(h.chat.transcript("b").readAll().length, 0);
  } finally {
    await h.cleanup();
  }
});

test("a bot in onboarding cannot message another chat", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] });
  try {
    const sender = h.profiles.get("a")!;
    h.profiles.save({ ...sender, onboarding: { requestId: "setup-a", locale: "en", stage: "greeting", error: null } });
    for (const chatId of ["b", "room-1"]) {
      assert.throws(() => h.turns.handleMessage("w1:p-a", chatId, "hello"),
        (error: unknown) => error instanceof ControlError && error.code === "not_a_member");
      assert.equal(h.chat.transcript(chatId).readAll().length, 0);
    }
  } finally {
    await h.cleanup();
  }
});

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
    assert.match(prompts[1]!.text, /A \(bot id: a\): a says hi/);
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

test("bot A and bot B exchange DM messages, and bot B also posts to their shared room", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] });
  try {
    // Hop 1: bot A messages bot B's DM.
    h.turns.handleMessage("w1:p-a", "b", "Please review change 42");
    await h.runQueue.enqueue("b", async () => undefined);
    assert.equal((h.chat.transcript("b").last()?.author as { id?: string } | undefined)?.id, "a");

    // Hop 2: bot B replies back into bot A's DM.
    h.turns.handleMessage("w1:p-b", "a", "Review complete");
    await h.runQueue.enqueue("a", async () => undefined);
    assert.equal((h.chat.transcript("a").last()?.author as { id?: string } | undefined)?.id, "b");

    // Hop 3: bot B separately posts to the room it shares with bot A.
    h.turns.handleMessage("w1:p-b", "room-1", "Review complete, posting to the room");
    await h.runQueue.enqueue("room-1", async () => undefined);
    assert.equal((h.chat.transcript("room-1").last()?.author as { id?: string } | undefined)?.id, "b");
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
