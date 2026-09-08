import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "../src/config.ts";
import { HostEvents } from "../src/host-events.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { ChatService } from "../src/services/chat-service.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { RoomStore } from "../src/store/room-store.ts";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";

function harness() {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BOT_USER_NAME: "ray" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  profiles.save(sampleProfile({ id: "reviewer", name: "Reviewer" }));
  profiles.save(sampleProfile({ id: "fixer", name: "Fixer" }));
  rooms.save(sampleRoom({ id: "room-auth-1a2b", memberIds: ["reviewer", "fixer"] }));
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  const events = new HostEvents();
  const seen: { family: string; payload: unknown }[] = [];
  for (const family of ["agents", "agent-upserted", "transcript"] as const) events.on(family, (payload) => seen.push({ family, payload }));
  let now = 100;
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: () => false, now: () => (now += 1) });
  return { temp, chat, seen };
}

test("appendUser stores the renderer message shape, marks activity, and emits transcript + upsert", () => {
  const h = harness();
  try {
    const entry = h.chat.appendUser("room-auth-1a2b", { content: "go", clientNonce: "n1" });
    assert.equal(entry.kind, "message");
    assert.equal(entry.clientNonce, "n1");
    assert.deepEqual(entry.author, { id: "user", name: "ray" });
    const transcript = h.seen.find((e) => e.family === "transcript")?.payload as { type: string; agentId: string; entry: { id: string } };
    assert.deepEqual([transcript.type, transcript.agentId, transcript.entry.id], ["appended", "room-auth-1a2b", "e1"]);
    const upsert = h.seen.find((e) => e.family === "agent-upserted")?.payload as { id: string; hasUnread: boolean; lastMessagePreview: string };
    assert.equal(upsert.id, "room-auth-1a2b");
    assert.equal(upsert.lastMessagePreview, "go");
    assert.deepEqual(h.chat.history("room-auth-1a2b"), [{ speaker: { kind: "user", name: "ray" }, content: "go" }]);
  } finally {
    h.temp.cleanup();
  }
});

test("bot messages, notices, reactions, and view state flow through summaries", () => {
  const h = harness();
  try {
    h.chat.appendUser("room-auth-1a2b", { content: "go" });
    const said = h.chat.appendBot("room-auth-1a2b", { id: "reviewer", name: "Reviewer" }, "done");
    h.chat.appendNotice("room-auth-1a2b", "fixer is busy");
    assert.equal(h.chat.history("room-auth-1a2b").length, 2);
    const reacted = h.chat.react("room-auth-1a2b", said.id, "👍");
    assert.deepEqual(reacted?.reactions, [{ emoji: "👍", by: "me" }]);
    assert.equal((h.seen.at(-1)?.payload as { type: string }).type, "updated");
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, true);
    h.chat.markViewed("room-auth-1a2b");
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, false);
    h.chat.setUnread("room-auth-1a2b", true);
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, true);
    const page = h.chat.tail("room-auth-1a2b", 2);
    assert.equal(page.entries.length, 2);
    assert.equal(page.nextBeforeSeq, 2);
  } finally {
    h.temp.cleanup();
  }
});

test("listSummaries includes bots and rooms; unknown chats are null", () => {
  const h = harness();
  try {
    const ids = h.chat.listSummaries().map((s) => s.id).sort();
    assert.deepEqual(ids, ["fixer", "reviewer", "room-auth-1a2b"]);
    assert.equal(h.chat.summary("nope"), null);
    assert.equal(h.chat.chatKind("reviewer"), "bot");
    assert.equal(h.chat.chatKind("room-auth-1a2b"), "room");
    assert.throws(() => h.chat.appendUser("nope", { content: "x" }));
  } finally {
    h.temp.cleanup();
  }
});
