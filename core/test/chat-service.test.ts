import { readFileSync, writeFileSync } from "node:fs";
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

/** Pass an existing home to reopen the same on-disk state with a fresh ChatService (simulates a host restart).
 * Pass `now` to override the default incrementing clock (e.g. a constant clock to simulate two chats
 * receiving messages within the same real-time millisecond). */
function harness(existingHome?: string, now?: () => number) {
  const temp = existingHome == null ? makeTempHome() : { home: existingHome, cleanup: () => {} };
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
  let tick = 100;
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: () => false, now: now ?? (() => (tick += 1)) });
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
    const latestSeq = h.chat.tail("room-auth-1a2b", 1).entries[0]?.seq ?? 0;
    assert.deepEqual(h.chat.markRead("room-auth-1a2b", latestSeq), { lastReadSeq: latestSeq });
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, false);
    h.chat.setUnread("room-auth-1a2b", true);
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, true);
    h.chat.setUnread("room-auth-1a2b", false);
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, false);
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
    // Migration/view-state must not be created as a side effect of probing an unknown chat.
    assert.equal(new ViewStateStore(h.temp.home).hasSeqFields("nope"), false);
    assert.equal(h.chat.chatKind("reviewer"), "bot");
    assert.equal(h.chat.chatKind("room-auth-1a2b"), "room");
    assert.throws(() => h.chat.appendUser("nope", { content: "x" }));
  } finally {
    h.temp.cleanup();
  }
});

test("markRead only acknowledges through the requested seq: a stale/partial ACK leaves newer bot replies unread", () => {
  const h = harness();
  try {
    h.chat.appendUser("reviewer", { content: "go" }); // seq 1
    h.chat.appendBot("reviewer", { id: "reviewer", name: "Reviewer" }, "loaded page"); // seq 2
    h.chat.appendBot("reviewer", { id: "reviewer", name: "Reviewer" }, "arrived after load"); // seq 3
    // Renderer only loaded/rendered through seq 2 (e.g. a page fetched before the seq-3 reply landed).
    assert.deepEqual(h.chat.markRead("reviewer", 2), { lastReadSeq: 2 });
    assert.equal(h.chat.summary("reviewer")?.hasUnread, true);
    assert.equal(h.chat.summary("reviewer")?.lastReadSeq, 2);
    // A later, lower-seq ACK response arriving out of order cannot roll the watermark back.
    assert.deepEqual(h.chat.markRead("reviewer", 1), { lastReadSeq: 2 });
    // Once the renderer catches up and ACKs through the latest seq, unread clears.
    assert.deepEqual(h.chat.markRead("reviewer", 3), { lastReadSeq: 3 });
    assert.equal(h.chat.summary("reviewer")?.hasUnread, false);
  } finally {
    h.temp.cleanup();
  }
});

test("markRead clamps an over-eager ACK to the transcript's actual latest seq", () => {
  const h = harness();
  try {
    h.chat.appendUser("reviewer", { content: "go" }); // seq 1
    assert.deepEqual(h.chat.markRead("reviewer", 999), { lastReadSeq: 1 });
    assert.equal(h.chat.summary("reviewer")?.lastReadSeq, 1);
  } finally {
    h.temp.cleanup();
  }
});

test("appendUser no longer auto-acknowledges prior unread bot messages", () => {
  const h = harness();
  try {
    h.chat.appendBot("reviewer", { id: "reviewer", name: "Reviewer" }, "hello");
    assert.equal(h.chat.summary("reviewer")?.hasUnread, true);
    h.chat.appendUser("reviewer", { content: "go" });
    assert.equal(h.chat.summary("reviewer")?.hasUnread, true, "sending a message must not mark prior bot replies as read");
  } finally {
    h.temp.cleanup();
  }
});

test("a notice is neither incoming nor outgoing: it must not move lastIncomingSeq or flip unread", () => {
  const h = harness();
  try {
    h.chat.appendUser("reviewer", { content: "go" }); // seq 1
    const before = h.chat.summary("reviewer");
    assert.equal(before?.hasUnread, false);
    assert.equal(before?.lastIncomingSeq, 0);
    h.chat.appendNotice("reviewer", "fixer is busy"); // seq 2, notice
    const after = h.chat.summary("reviewer");
    assert.equal(after?.lastIncomingSeq, 0, "a notice must not be treated as an incoming bot reply");
    assert.equal(after?.hasUnread, false);
  } finally {
    h.temp.cleanup();
  }
});

test("an existing view-state file without seq fields is migrated from the transcript on first access", () => {
  const h = harness();
  try {
    h.chat.appendBot("reviewer", { id: "reviewer", name: "Reviewer" }, "first"); // seq 1, unread
    h.chat.markRead("reviewer", 1); // acknowledges seq 1
    h.chat.appendBot("reviewer", { id: "reviewer", name: "Reviewer" }, "second"); // seq 2, unread
    const before = h.chat.summary("reviewer");
    assert.equal(before?.lastReadSeq, 1);
    assert.equal(before?.lastIncomingSeq, 2);
    assert.equal(before?.hasUnread, true);

    // Simulate an old on-disk store written before seq fields existed: drop them and re-open.
    const viewStatePath = new ViewStateStore(h.temp.home).path;
    const raw = JSON.parse(readFileSync(viewStatePath, "utf8")) as Record<string, Record<string, unknown>>;
    for (const state of Object.values(raw)) {
      delete state.lastReadSeq;
      delete state.lastIncomingSeq;
      delete state.lastMessageAt;
    }
    writeFileSync(viewStatePath, JSON.stringify(raw), "utf8");

    const migratedHost = harness(h.temp.home);
    const after = migratedHost.chat.summary("reviewer");
    assert.equal(after?.lastReadSeq, 1);
    assert.equal(after?.lastIncomingSeq, 2);
    assert.equal(after?.hasUnread, true);
  } finally {
    h.temp.cleanup();
  }
});

test("lastMessageAt is a strictly increasing global sort key: two chats messaged within the same real-time ms still get a deterministic, distinct order (task 3)", () => {
  // A constant clock simulates two messages landing within the same millisecond of wall time.
  const h = harness(undefined, () => 500);
  try {
    h.chat.appendUser("reviewer", { content: "go" });
    const reviewerAt = h.chat.summary("reviewer")?.lastMessageAt ?? 0;
    h.chat.appendUser("fixer", { content: "go too" });
    const fixerAt = h.chat.summary("fixer")?.lastMessageAt ?? 0;
    assert.ok(fixerAt > reviewerAt, `expected fixer's lastMessageAt (${fixerAt}) to be strictly greater than reviewer's (${reviewerAt})`);
    // A bot reply to the chat that is currently behind the global max is bumped past it too.
    h.chat.appendBot("reviewer", { id: "reviewer", name: "Reviewer" }, "reply");
    const reviewerReplyAt = h.chat.summary("reviewer")?.lastMessageAt ?? 0;
    assert.ok(reviewerReplyAt > fixerAt, `expected reviewer's reply lastMessageAt (${reviewerReplyAt}) to be strictly greater than fixer's (${fixerAt})`);
  } finally {
    h.temp.cleanup();
  }
});

test("a notice never bumps lastMessageAt, even on a constant clock shared with a real message", () => {
  const h = harness(undefined, () => 500);
  try {
    h.chat.appendUser("reviewer", { content: "go" });
    const before = h.chat.summary("reviewer")?.lastMessageAt;
    h.chat.appendNotice("reviewer", "fixer is busy");
    assert.equal(h.chat.summary("reviewer")?.lastMessageAt, before, "a notice must not move lastMessageAt");
  } finally {
    h.temp.cleanup();
  }
});
