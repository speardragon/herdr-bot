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

async function harness(state: FakeHerdrState, roomMemberIds = state.agents.map((a) => a.name ?? ""), options: { now?: () => number } = {}) {
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
  const inbox = new SayInbox(options.now);
  let turns: TurnService | null = null;
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: (id) => turns?.isTurnActive(id) ?? false, ...(options.now == null ? {} : { now: options.now }) });
  const roster = new RosterService({ config, profiles, rooms, cli, mirror });
  turns = new TurnService({ config, roster, chat, runQueue, cli, mirror, inbox, ...(options.now == null ? {} : { now: options.now }) });
  const server = await startControlServer(join(temp.home, "host.sock"), async (method, params) => {
    if (method === "say") return turns!.handleSay(String(params.paneId), String(params.chatId), String(params.text));
    throw new ControlError("unknown_method", method);
  });
  return { temp, fake, chat, turns, profiles, inbox, runQueue, roster, mirror, cleanup: async () => { await server.close(); temp.cleanup(); } };
}

test("queued DM and room turns read the latest profile after acquiring the bot lock", async () => {
  const h = await harness({ agents: [agent("a")], workspaces: [] });
  try {
    for (const chatId of ["a", "room-1"]) {
      let release!: () => void;
      const held = h.turns.withBotLock("a", () => new Promise<void>((resolve) => { release = resolve; }));
      await new Promise<void>((resolve) => setImmediate(resolve));
      h.chat.appendUser(chatId, { content: "hello" });
      const turn = h.turns.schedule(chatId);
      await new Promise<void>((resolve) => setImmediate(resolve));
      h.roster.updateProfile("a", { name: chatId, title: "", description: "latest focus" });
      release();
      await held;
      await turn;
      const text = h.fake.readState().prompts!.at(-1)!.text;
      assert.ok(text.includes(JSON.stringify({ id: "a", name: chatId, title: "", description: "latest focus" })));
    }
  } finally {
    await h.cleanup();
  }
});

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
    assert.match(h.fake.readState().prompts![0]!.text, /A \(bot id: a\): Can you inspect the parser\?/);
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

test("a user message runs a full room turn: every member speaks in order, replies land in the transcript with authors", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [], onPrompt: { a: { say: ["a says hi"], sayOnce: true }, b: { say: ["b says hi"], sayOnce: true } } });
  try {
    h.chat.appendUser("room-1", { content: "hello everyone" });
    await h.turns.schedule("room-1");
    const texts = h.chat.transcript("room-1").readAll().map((e) => `${(e.author as { id: string } | undefined)?.id ?? "-"}:${e.kind}`);
    assert.deepEqual(texts.slice(0, 3), ["user:message", "a:send-message", "b:send-message"]);
    const prompts = h.fake.readState().prompts ?? [];
    assert.match(prompts[0]!.text, /\[herdr-bot room "auth" - with B\]/);
    assert.match(prompts[0]!.text, /ray \(user\): hello everyone/);
    // Members run in order, one at a time (not concurrently -- see A1's design note in rooms/cycle.ts),
    // so the second speaker's prompt includes the first speaker's same-round say.
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

test("handleSay enforces pane identity and membership; late says are appended, tagged, and announced", async () => {
  const h = await harness({ agents: [agent("a")], workspaces: [] });
  try {
    assert.throws(() => h.turns.handleSay("w9:p9", "room-1", "x"), (e: unknown) => e instanceof ControlError && e.code === "unknown_pane");
    assert.throws(() => h.turns.handleSay("w1:p-a", "room-other", "x"), (e: unknown) => e instanceof ControlError && e.code === "unknown_chat");
    // This turn was never opened at all (no `inbox.open` ever ran for room-1/a), so SayInbox has no
    // close time to compute `lateAfterMs` from -- lateAfterMs is therefore legitimately absent here; the
    // say-inbox unit tests cover the case where it IS known (closed, then a late say arrives after).
    const late = h.turns.handleSay("w1:p-a", "room-1", "late thought");
    assert.equal(late.mode, "late");
    const entries = h.chat.transcript("room-1").readAll();
    const said = entries.find((e) => e.id === late.entryId)!;
    assert.equal(said.kind, "send-message");
    assert.equal(said.late, true);
    const notice = entries.find((e) => e.kind === "notice");
    assert.match(String(notice?.content), /A이\(가\) 늦게 응답을 완료했습니다/);
  } finally {
    await h.cleanup();
  }
});

test("a new user message is delivered into an already-open turn immediately, and the next say is tagged staleFor it", async () => {
  const h = await harness({ agents: [agent("a")], workspaces: [] });
  try {
    const turn = h.inbox.open("room-1", "a");
    h.turns.onUserMessage("room-1", "e-newer", "wait, actually just do X");
    // onUserMessage is fire-and-forget (real subprocess calls under the hood), so poll briefly instead
    // of assuming a single microtask tick is enough.
    const deadline = Date.now() + 2_000;
    let prompts: { target: string; text: string }[] = [];
    while (Date.now() < deadline) {
      prompts = h.fake.readState().prompts ?? [];
      if (prompts.some((p) => p.target === "a")) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    const calls = h.fake.readLog();
    const sendKeys = calls.find((argv) => argv[0] === "agent" && argv[1] === "send-keys" && argv[2] === "a");
    assert.ok(sendKeys, "expected an agent send-keys call authorizing the interrupt envelope");
    assert.ok(prompts.some((p) => p.target === "a" && p.text.includes("The user just added: wait, actually just do X")));
    // The first say after the interrupt is tagged staleFor the newer user entry; a second one is not.
    const first = h.inbox.accept("room-1", "a", "ok, doing X instead");
    assert.deepEqual(first, { mode: "in-turn", staleFor: "e-newer" });
    const second = h.inbox.accept("room-1", "a", "done");
    assert.deepEqual(second, { mode: "in-turn" });
    turn.close();
  } finally {
    await h.cleanup();
  }
});

test("onUserMessage does nothing when nobody's turn is open in that chat (no false interrupt)", async () => {
  const h = await harness({ agents: [agent("a")], workspaces: [] });
  try {
    h.turns.onUserMessage("room-1", "e1", "hello");
    await new Promise<void>((resolve) => setImmediate(resolve));
    const sendKeys = h.fake.readLog().filter((argv) => argv[0] === "agent" && argv[1] === "send-keys");
    assert.equal(sendKeys.length, 0);
  } finally {
    await h.cleanup();
  }
});

test("A2: onUserMessage never types a mid-turn interrupt into a bot blocked on an approval prompt, but its next say is still tagged staleFor", async () => {
  const h = await harness({ agents: [agent("a", "blocked")], workspaces: [] });
  try {
    const turn = h.inbox.open("room-1", "a");
    h.turns.onUserMessage("room-1", "e-newer", "wait, actually just do X");
    // Give any (wrongly) fire-and-forget delivery a moment to land before asserting its absence.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const sendKeys = h.fake.readLog().filter((argv) => argv[0] === "agent" && argv[1] === "send-keys" && argv[2] === "a");
    assert.equal(sendKeys.length, 0, "keystrokes must never be typed into a blocked pane -- they could silently answer its approval prompt");
    const prompts = h.fake.readState().prompts ?? [];
    assert.equal(prompts.some((p) => p.target === "a"), false, "no interrupt prompt should be sent to a blocked bot either");
    // The user's message is still recorded as an interrupt even though nothing was typed -- the bot's
    // next say (once unblocked and its turn reopens) is still tagged staleFor this entry.
    const first = h.inbox.accept("room-1", "a", "ok, doing X instead");
    assert.deepEqual(first, { mode: "in-turn", staleFor: "e-newer" });
    turn.close();
  } finally {
    await h.cleanup();
  }
});

test("a busy-skipped user message is held, then surfaced and tagged answersHeld when the bot next speaks in that chat", async () => {
  const h = await harness({ agents: [agent("a", "working")], workspaces: [], onPrompt: { a: { say: ["sorry, to answer: it's 4"], sayOnce: true, finalStatus: "idle" } } });
  try {
    h.chat.appendUser("room-1", { content: "quick one: what's 2+2?" });
    await h.turns.schedule("room-1"); // "a" is busy (working) -> busy-skip, question held
    const held = h.chat.heldEntriesFor("room-1", "a");
    assert.equal(held.length, 1);
    assert.equal(held[0]?.content, "quick one: what's 2+2?");

    // Now "a" becomes idle and a later message opens a real turn; its prompt surfaces the held question,
    // and its say gets tagged answersHeld + the held marker is cleared.
    h.fake.writeState({ ...h.fake.readState(), agents: [{ ...agent("a"), agent_status: "idle" }] });
    await h.mirror.refresh();
    h.chat.appendUser("room-1", { content: "still there?" });
    await h.turns.schedule("room-1");

    const prompts = h.fake.readState().prompts ?? [];
    assert.ok(prompts.some((p) => p.target === "a" && /Earlier question you could not answer because you were busy: quick one: what's 2\+2\?/.test(p.text)));
    const entries = h.chat.transcript("room-1").readAll();
    const answered = entries.find((e) => (e.message as { content?: string } | undefined)?.content === "sorry, to answer: it's 4");
    assert.ok(answered);
    assert.equal(answered?.answersHeld, held[0]?.id);
    assert.equal(h.chat.heldEntriesFor("room-1", "a").length, 0);
  } finally {
    await h.cleanup();
  }
});

test("a 4th bot<->bot message within 5 minutes is rejected with a loop-guard notice in the sender's own chat, and the reply direction counts toward the same pair", async () => {
  let now = 0;
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] }, [], { now: () => now });
  try {
    for (let i = 0; i < 3; i += 1) {
      h.turns.handleMessage("w1:p-a", "b", `ping ${i}`);
      now += 1_000;
    }
    assert.throws(
      () => h.turns.handleMessage("w1:p-a", "b", "ping 3"),
      (error: unknown) => error instanceof ControlError && error.code === "over_cap" && /loop guard: ask the user before messaging B again/.test(error.message),
    );
    const notices = h.chat.transcript("a").readAll().filter((e) => e.kind === "notice");
    assert.ok(notices.some((n) => /loop guard/.test(String(n.content))));
    // The opposite direction counts toward the SAME pair, so it is rejected too.
    assert.throws(
      () => h.turns.handleMessage("w1:p-b", "a", "pong"),
      (error: unknown) => error instanceof ControlError && error.code === "over_cap",
    );
  } finally {
    await h.cleanup();
  }
});

test("the loop-guard window expires, and a room post is never subject to it", async () => {
  let now = 0;
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [] }, ["a", "b"], { now: () => now });
  try {
    for (let i = 0; i < 3; i += 1) h.turns.handleMessage("w1:p-a", "b", `ping ${i}`);
    assert.throws(() => h.turns.handleMessage("w1:p-a", "b", "ping 3"), (e: unknown) => e instanceof ControlError && e.code === "over_cap");
    now += 5 * 60 * 1000 + 1;
    assert.doesNotThrow(() => h.turns.handleMessage("w1:p-a", "b", "ping after the window"));
    // A room post is not a bot<->bot DM pair, so it is never loop-guarded.
    for (let i = 0; i < 5; i += 1) h.turns.handleMessage("w1:p-a", "room-1", `room ping ${i}`);
  } finally {
    await h.cleanup();
  }
});
