import { test } from "node:test";
import assert from "node:assert/strict";
import { botSummary, roomSummary } from "../src/model/summaries.ts";
import { botMessageEntry } from "../src/model/entries.ts";
import { OFFLINE_RUNTIME, type BotRuntime } from "../src/herdr/types.ts";
import type { StoredEntry } from "../src/store/transcript-store.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";
import { parseBlockedPrompt } from "../src/herdr/blocked-prompt.ts";
import { ASK_SINGLE_SCREEN } from "./helpers/prompt-screens.ts";

const RUNTIME: BotRuntime = { status: "idle", paneId: "w1:p2", workspaceId: "w1", sessionId: "s1", kind: "claude", prompt: null };
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

test("lastEntry/lastMessagePreview are capped so a huge message is not re-sent in full on every summary", () => {
  const huge: StoredEntry = { ...botMessageEntry({ content: "x".repeat(5_000), author: { id: "reviewer", name: "Reviewer" }, timestampMs: 20 }), seq: 3, id: "e3" } as StoredEntry;
  const summary = botSummary({ profile: sampleProfile(), runtime: RUNTIME, last: huge, view: VIEW, isTurnActive: false });
  assert.ok(summary.lastMessagePreview != null && summary.lastMessagePreview.length < 5_000, "the preview must be capped, not the full 5000 chars");
  assert.equal(summary.lastEntry?.text, summary.lastMessagePreview);
  assert.ok(summary.lastMessagePreview?.endsWith("…"));

  // A short message passes through unchanged (no trailing ellipsis added).
  const shortSummary = botSummary({ profile: sampleProfile(), runtime: RUNTIME, last: LAST, view: VIEW, isTurnActive: false });
  assert.equal(shortSummary.lastMessagePreview, "hello there");

  // The cap counts code points, not UTF-16 code units, so a multi-unit character at the boundary is
  // never split into an unpaired surrogate.
  const emojiHeavy: StoredEntry = { ...botMessageEntry({ content: "👍".repeat(1_200), author: { id: "reviewer", name: "Reviewer" }, timestampMs: 20 }), seq: 4, id: "e4" } as StoredEntry;
  const emojiSummary = botSummary({ profile: sampleProfile(), runtime: RUNTIME, last: emojiHeavy, view: VIEW, isTurnActive: false });
  const preview = emojiSummary.lastMessagePreview!;
  assert.equal([...preview.slice(0, preview.length - 1)].length, 1_000);
  assert.doesNotMatch(preview, /�/, "must not contain a replacement character from a split surrogate pair");
});

test("bot summary carries the blocked prompt on herdrBot.prompt and drops it when not blocked", () => {
  const prompt = parseBlockedPrompt(ASK_SINGLE_SCREEN)!;
  const blocked = botSummary({ profile: sampleProfile(), runtime: { ...RUNTIME, status: "blocked", prompt }, last: null, view: VIEW, isTurnActive: false });
  assert.equal(blocked.herdrBot?.prompt?.question, "Which color do you prefer?");
  assert.deepEqual(blocked.awaitingUserResponse, { reason: "approval" });
  const idle = botSummary({ profile: sampleProfile(), runtime: RUNTIME, last: null, view: VIEW, isTurnActive: false });
  assert.equal(idle.herdrBot?.prompt, null);
});
