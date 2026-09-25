import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIME_GAP_MS,
  localDateKey,
  shouldInsertTimeSeparator,
  withTranscriptTimeSeparators,
} from "../src/production/transcript-time-separators.ts";
import type { ConversationTranscriptEntry } from "../src/recovered/features/conversation/workspace/model.ts";

// herdr-bot (Task 10, plan bot-collaboration-and-launch-settings): transcript day/time separators
// -- inserted before the first displayed entry, before a local-calendar-date change, and before a
// >=30 minute gap from the previous *displayed* entry. Fixtures use the local-time Date constructor
// so day-boundary math is timezone-safe under node:test.

const NOW = new Date(2026, 8, 25, 13, 36).getTime(); // Fri 2026-09-25 13:36 local

function message(id: string, timestampMs: number): ConversationTranscriptEntry {
  return { kind: "message", id, role: "user", author: "A", text: `msg-${id}`, timestampMs };
}

function notice(id: string, timestampMs: number): ConversationTranscriptEntry {
  return { kind: "notice", id, text: `notice-${id}`, timestampMs };
}

function unreadDivider(id: string): ConversationTranscriptEntry {
  return { kind: "unread-divider", id, newMessageCount: 1 };
}

test("shouldInsertTimeSeparator: null previous (first item) always inserts", () => {
  assert.equal(shouldInsertTimeSeparator(null, NOW), true);
});

test("shouldInsertTimeSeparator: date change inserts even under 30 minutes", () => {
  const previous = new Date(2026, 8, 24, 23, 59).getTime();
  const current = new Date(2026, 8, 25, 0, 1).getTime();
  assert.equal(current - previous < TIME_GAP_MS, true);
  assert.notEqual(localDateKey(previous), localDateKey(current));
  assert.equal(shouldInsertTimeSeparator(previous, current), true);
});

test("shouldInsertTimeSeparator: >=30 minute gap inserts on the same date", () => {
  const previous = new Date(2026, 8, 25, 10, 0).getTime();
  const current = previous + TIME_GAP_MS;
  assert.equal(shouldInsertTimeSeparator(previous, current), true);
});

test("shouldInsertTimeSeparator: 29m59s gap does not insert", () => {
  const previous = new Date(2026, 8, 25, 10, 0).getTime();
  const current = previous + TIME_GAP_MS - 1000;
  assert.equal(shouldInsertTimeSeparator(previous, current), false);
});

test("shouldInsertTimeSeparator: zero gap (same timestamp) does not insert", () => {
  const at = new Date(2026, 8, 25, 10, 0).getTime();
  assert.equal(shouldInsertTimeSeparator(at, at), false);
});

test("withTranscriptTimeSeparators: inserts exactly one separator before the first displayed entry", () => {
  const at = new Date(2026, 8, 25, 13, 0).getTime();
  const result = withTranscriptTimeSeparators([message("m1", at)], NOW, "ko");
  assert.equal(result.length, 2);
  assert.equal(result[0]!.kind, "time-separator");
  assert.equal(result[0]!.id, "time:m1");
  assert.equal(result[1]!.id, "m1");
});

test("withTranscriptTimeSeparators: inserts a separator before a date change", () => {
  const day1 = new Date(2026, 8, 24, 10, 0).getTime();
  const day2 = new Date(2026, 8, 25, 10, 5).getTime();
  const result = withTranscriptTimeSeparators([message("m1", day1), message("m2", day2)], NOW, "ko");
  const kinds = result.map((entry) => entry.kind);
  assert.deepEqual(kinds, ["time-separator", "message", "time-separator", "message"]);
  assert.equal(result[2]!.id, "time:m2");
});

test("withTranscriptTimeSeparators: inserts a separator after a >=30 minute gap on the same day", () => {
  const t1 = new Date(2026, 8, 25, 9, 0).getTime();
  const t2 = t1 + TIME_GAP_MS;
  const result = withTranscriptTimeSeparators([message("m1", t1), message("m2", t2)], NOW, "ko");
  const kinds = result.map((entry) => entry.kind);
  assert.deepEqual(kinds, ["time-separator", "message", "time-separator", "message"]);
});

test("withTranscriptTimeSeparators: no separator at 29m59s or zero gap", () => {
  const t1 = new Date(2026, 8, 25, 9, 0).getTime();
  const t2 = t1 + TIME_GAP_MS - 1000;
  const t3 = t2; // zero gap, same timestamp
  const result = withTranscriptTimeSeparators([message("m1", t1), message("m2", t2), message("m3", t3)], NOW, "ko");
  const kinds = result.map((entry) => entry.kind);
  assert.deepEqual(kinds, ["time-separator", "message", "message", "message"]);
});

test("withTranscriptTimeSeparators: notice entries count as displayed items for gap/date math", () => {
  const t1 = new Date(2026, 8, 25, 9, 0).getTime();
  const t2 = t1 + TIME_GAP_MS; // gap measured from the notice, not skipped
  const result = withTranscriptTimeSeparators([notice("n1", t1), message("m2", t2)], NOW, "ko");
  const kinds = result.map((entry) => entry.kind);
  assert.deepEqual(kinds, ["time-separator", "notice", "time-separator", "message"]);
});

test("withTranscriptTimeSeparators: structural entries without a timestamp never get their own separator and don't reset the gap", () => {
  const t1 = new Date(2026, 8, 25, 9, 0).getTime();
  const t2 = t1 + 1000; // well under the gap threshold
  const result = withTranscriptTimeSeparators([message("m1", t1), unreadDivider("u1"), message("m2", t2)], NOW, "ko");
  const kinds = result.map((entry) => entry.kind);
  assert.deepEqual(kinds, ["time-separator", "message", "unread-divider", "message"]);
});

test("withTranscriptTimeSeparators: re-running on a merged/paginated list produces no duplicate separators", () => {
  const older = new Date(2026, 8, 24, 9, 0).getTime();
  const newer = new Date(2026, 8, 25, 9, 0).getTime();
  const firstPass = withTranscriptTimeSeparators([message("m2", newer)], NOW, "ko");
  // Simulate an older page merged in front of the already-separated list, as ProductionRenderer's
  // pagination merge would do, then recompute from scratch on the full merged list.
  const merged = [message("m1", older), ...firstPass];
  const result = withTranscriptTimeSeparators(merged, NOW, "ko");
  const kinds = result.map((entry) => entry.kind);
  assert.deepEqual(kinds, ["time-separator", "message", "time-separator", "message"]);
  const separatorIds = result.filter((entry) => entry.kind === "time-separator").map((entry) => entry.id);
  assert.deepEqual(separatorIds, ["time:m1", "time:m2"]);
});

test("Korean labels: today, yesterday, and an older date all format as expected", () => {
  const today = new Date(2026, 8, 25, 13, 36).getTime();
  const yesterday = new Date(2026, 8, 24, 13, 36).getTime();
  const older = new Date(2026, 8, 20, 13, 36).getTime();
  const result = withTranscriptTimeSeparators(
    [message("m1", older), message("m2", yesterday), message("m3", today)],
    NOW,
    "ko"
  );
  const separatorLabels = result.filter((entry) => entry.kind === "time-separator").map((entry) => (entry as { label: string }).label);
  assert.deepEqual(separatorLabels, ["9월 20일 오후 1:36", "어제 오후 1:36", "오늘 오후 1:36"]);
});

test("English labels: Today/Yesterday equivalents with the matching clock format", () => {
  const today = new Date(2026, 8, 25, 13, 36).getTime();
  const yesterday = new Date(2026, 8, 24, 13, 36).getTime();
  const result = withTranscriptTimeSeparators([message("m1", yesterday), message("m2", today)], NOW, "en");
  const separatorLabels = result.filter((entry) => entry.kind === "time-separator").map((entry) => (entry as { label: string }).label);
  assert.deepEqual(separatorLabels, ["Yesterday 1:36 PM", "Today 1:36 PM"]);
});
