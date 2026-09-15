import { test } from "node:test";
import assert from "node:assert/strict";
import { botSummary, roomSummary } from "../src/model/summaries.ts";
import { botMessageEntry } from "../src/model/entries.ts";
import { OFFLINE_RUNTIME, type BotRuntime } from "../src/herdr/types.ts";
import type { StoredEntry } from "../src/store/transcript-store.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";

const RUNTIME: BotRuntime = { status: "idle", paneId: "w1:p2", workspaceId: "w1", sessionId: "s1", kind: "claude" };
const VIEW = { lastViewedAt: 10, lastActivityAt: 20, isManuallyUnread: false, lastReadSeq: 0, lastIncomingSeq: 3, lastMessageAt: 20 };
const LAST: StoredEntry = { ...botMessageEntry({ content: "hello there", author: { id: "reviewer", name: "Reviewer" }, timestampMs: 20 }), seq: 3, id: "e3" } as StoredEntry;

test("bot summary passes the optional profile label through as title, defaulting to an empty string", () => {
  const unlabeled = botSummary({ profile: sampleProfile(), runtime: RUNTIME, last: null, view: VIEW, isTurnActive: false });
  assert.equal(unlabeled.title, "");
  const labeled = botSummary({ profile: { ...sampleProfile(), title: "research, marketing" }, runtime: RUNTIME, last: null, view: VIEW, isTurnActive: false });
  assert.equal(labeled.title, "research, marketing");
});

test("bot summary mirrors runtime status into isRunning / awaitingUserResponse", () => {
  const idle = botSummary({ profile: sampleProfile(), runtime: RUNTIME, last: LAST, view: VIEW, isTurnActive: false });
  assert.equal(idle.id, "reviewer");
  assert.equal(idle.isGroup, false);
  assert.equal(idle.isRunning, false);
  assert.equal(idle.awaitingUserResponse, null);
  assert.equal(idle.hasUnread, true);
  assert.equal(idle.lastReadSeq, 0);
  assert.equal(idle.lastIncomingSeq, 3);
  assert.equal(idle.lastMessageAt, 20);
  assert.deepEqual(idle.lastEntry, { kind: "text", text: "hello there" });
  assert.equal(idle.lastMessagePreview, "hello there");
  assert.equal(idle.updatedAt, 20);
  assert.equal(idle.herdrBot?.status, "idle");

  const working = botSummary({ profile: sampleProfile(), runtime: { ...RUNTIME, status: "working" }, last: null, view: VIEW, isTurnActive: false });
  assert.equal(working.isRunning, true);

  const blocked = botSummary({ profile: sampleProfile(), runtime: { ...RUNTIME, status: "blocked" }, last: null, view: VIEW, isTurnActive: false });
  assert.deepEqual(blocked.awaitingUserResponse, { reason: "approval" });

  const offline = botSummary({ profile: sampleProfile(), runtime: OFFLINE_RUNTIME, last: null, view: VIEW, isTurnActive: false });
  assert.deepEqual(offline.awaitingUserResponse, { reason: "offline" });
});

test("room summary is a group with member ids and turn activity", () => {
  const summary = roomSummary({ room: sampleRoom(), last: LAST, view: { ...VIEW, lastViewedAt: 30, lastReadSeq: 3 }, isTurnActive: true });
  assert.equal(summary.isGroup, true);
  assert.deepEqual(summary.memberIds, ["reviewer", "fixer"]);
  assert.equal(summary.isRunning, true);
  assert.equal(summary.hasUnread, false);
  assert.equal(summary.lastReadSeq, 3);
  assert.equal(summary.herdrBot, null);
});
