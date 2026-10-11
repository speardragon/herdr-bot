/**
 * End-to-end: boots a real Host against the fake herdr binary, then drives it entirely through
 * `createAppClient` + `createInMemoryTransport` -- the same client surface a renderer would use, just
 * without a real ipc hop. Exercises: create a bot, create a room, send a message, receive entry events,
 * answer a pending prompt, and search messages.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHost } from "../../src/host.ts";
import { resolveConfig } from "../../src/config.ts";
import { createHerdrCli } from "../../src/herdr/cli.ts";
import { createAppApiServer } from "../../src/app-api/server.ts";
import { createAppClient } from "../../src/app-api/client.ts";
import { createInMemoryTransport } from "../../src/app-api/in-memory-transport.ts";
import type { AppApiEvent, ChatSummary, TranscriptEntry } from "../../src/app-api/types.ts";
import { installFakeHerdr } from "../helpers/fake-herdr-state.ts";
import { makeTempHome } from "../helpers/temp-home.ts";
import { waitFor } from "../helpers/wait-for.ts";
import { ASK_SINGLE_SCREEN } from "../helpers/prompt-screens.ts";

test("app-api end to end: create bot, create room, send a message, receive events, answer a prompt, search messages", async () => {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [], onPrompt: { reviewer: { say: ["on it"], sayOnce: true } } });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null, ensureSession: null });
  await host.start();
  const server = createAppApiServer(host);

  const events: AppApiEvent[] = [];
  const client = createAppClient(createInMemoryTransport(server), { onResyncNeeded: () => assert.fail("unexpected event gap") });
  const unsubscribe = client.subscribe("*", (event) => events.push(event));

  try {
    // Create a bot.
    const bot = await client.call("bot.create", { name: "Reviewer", id: "reviewer", provider: "claude", cwd: "/tmp/repo", permissionMode: "ask" });
    assert.equal(bot.chat.id, "reviewer");
    assert.equal(bot.chat.kind, "bot");
    // Let the background identity-brief send finish before anything else touches this bot's pane, so
    // it cannot race the blocked-prompt phase below under heavy parallel test load.
    await host.roster.briefSettled("reviewer");

    // Create a room with that bot as a member.
    const room = await client.call("room.create", { name: "Auth", memberIds: ["reviewer"] });
    assert.equal(room.chat.isGroup, true);

    const list = await client.call("chat.list", undefined);
    assert.deepEqual(list.map((c: ChatSummary) => c.id).sort(), ["reviewer", room.chat.id].sort());

    // Send a message and see it land in the transcript.
    const sent = await client.call("message.send", { chatId: "reviewer", text: "please review the auth change" });
    const page = await client.call("transcript.page", { chatId: "reviewer" });
    assert.ok(page.entries.some((entry: TranscriptEntry) => entry.id === sent.entryId));

    // Wait for the bot's reply to land, observed live through the event stream (not by re-polling).
    await waitFor(() => events.some((e) => e.type === "transcript.entryAppended" && (e.payload as { entry: TranscriptEntry }).entry.kind === "send-message"));
    const replyPage = await client.call("transcript.page", { chatId: "reviewer" });
    assert.ok(replyPage.entries.some((entry: TranscriptEntry) => entry.kind === "send-message"));
    assert.ok(events.some((e) => e.type === "chat.listChanged"));
    assert.ok(events.some((e) => e.type === "chat.changed"));

    // Answer a pending prompt -- a second, freshly created bot with no scripted reply (sayOnce reviewer
    // already consumed its script above), so reading its blocked screen cannot race a still-in-flight
    // turn on it. Reading the blocked screen is itself a second async step after the status flips to
    // "blocked" (StatusMirror's own onChange fan-out), so poll a couple of refreshes rather than assume
    // one is always enough under load.
    const approverBot = await client.call("bot.create", { name: "Approver", id: "approver", provider: "claude", cwd: "/tmp/repo" });
    await host.roster.briefSettled(approverBot.chat.id);
    const state = fake.readState();
    fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "approver" ? { ...a, agent_status: "blocked" } : a)), screens: { approver: ASK_SINGLE_SCREEN } });
    let prompt: NonNullable<NonNullable<ChatSummary["bot"]>["pendingPrompt"]> | null = null;
    const deadline = Date.now() + 5_000;
    while (prompt == null) {
      await host.mirror.refresh();
      const blocked = (await client.call("chat.list", undefined)).find((c: ChatSummary) => c.id === "approver");
      prompt = blocked?.bot?.pendingPrompt ?? null;
      if (prompt != null) break;
      if (Date.now() >= deadline) throw new Error("approver's pending prompt never appeared");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(prompt.kind, "question");
    const answered = await client.call("prompt.answer", { botId: "approver", signature: prompt.signature, action: "option", key: "2" });
    assert.equal(answered.chat.id, "approver");

    // Search messages across the roster.
    const hits = await client.call("message.search", { query: "auth change" });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.chatId, "reviewer");

    // Every event observed carries a strictly increasing seq.
    for (let i = 1; i < events.length; i++) assert.equal(events[i]!.seq, events[i - 1]!.seq + 1);
  } finally {
    unsubscribe();
    // Host.stop() does not drain in-flight turns; wait (briefly, best-effort) for them to quiet down
    // before the temp home is deleted out from under them (see server.test.ts's harness for the same).
    const deadline = Date.now() + 3_000;
    while (host.status().runningTurns.length > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    server.close();
    await host.stop();
    temp.cleanup();
  }
});
