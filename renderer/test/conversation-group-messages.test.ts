import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTranscriptRows, shouldGroupWithPrevious, shouldShowDateSeparator } from "../src/features/conversation/group-messages.ts";
import type { TranscriptEntry } from "../src/data/types.ts";

function msg(id: string, seq: number, timestampMs: number, authorId: string, kind: string = "message"): TranscriptEntry {
  const author = { id: authorId, name: authorId };
  return kind === "send-message" ? { id, kind, seq, timestampMs, message: { type: "text", content: "x" }, author } : { id, kind, seq, timestampMs, content: "x", author };
}

const DAY = 24 * 60 * 60 * 1000;

test("shouldShowDateSeparator: true for the very first entry", () => {
  assert.equal(shouldShowDateSeparator(null, msg("a", 1, 1_000, "u")), true);
});

test("shouldShowDateSeparator: true across a calendar-day boundary even with a small gap", () => {
  const midnight = new Date(2024, 0, 2, 0, 0, 0).getTime();
  const prev = msg("a", 1, midnight - 1000, "u");
  const curr = msg("b", 2, midnight + 1000, "u");
  assert.equal(shouldShowDateSeparator(prev, curr), true);
});

test("shouldShowDateSeparator: true after a long gap on the same day, false within the gap", () => {
  const base = new Date(2024, 0, 2, 12, 0, 0).getTime();
  const prev = msg("a", 1, base, "u");
  assert.equal(shouldShowDateSeparator(prev, msg("b", 2, base + 20 * 60 * 1000, "u")), true);
  assert.equal(shouldShowDateSeparator(prev, msg("b", 2, base + 60 * 1000, "u")), false);
});

test("shouldGroupWithPrevious: same author+kind within the gap groups, different author doesn't", () => {
  const a = msg("a", 1, 0, "forge", "send-message");
  const b = msg("b", 2, 60_000, "forge", "send-message");
  const c = msg("c", 3, 60_000, "lens", "send-message");
  assert.equal(shouldGroupWithPrevious(a, b), true);
  assert.equal(shouldGroupWithPrevious(a, c), false);
  assert.equal(shouldGroupWithPrevious(null, a), false);
});

test("shouldGroupWithPrevious: a user message never groups with a bot message even from 'the same author id'", () => {
  const userMsg = msg("a", 1, 0, "user", "message");
  const botMsg = msg("b", 2, 1000, "user", "send-message");
  assert.equal(shouldGroupWithPrevious(userMsg, botMsg), false);
});

test("shouldGroupWithPrevious: breaks after the gap threshold", () => {
  const a = msg("a", 1, 0, "forge", "send-message");
  const b = msg("b", 2, 10 * 60 * 1000 + 1, "forge", "send-message");
  assert.equal(shouldGroupWithPrevious(a, b), false);
});

test("buildTranscriptRows: inserts a date row before the first message, groups consecutive same-author rows", () => {
  const entries = [msg("a", 1, 0, "forge", "send-message"), msg("b", 2, 1000, "forge", "send-message"), msg("c", 3, 2000, "lens", "send-message")];
  const rows = buildTranscriptRows(entries);
  assert.equal(rows[0]!.type, "date");
  assert.equal(rows[1]!.type, "message");
  assert.equal((rows[1] as { grouped: boolean }).grouped, false);
  assert.equal((rows[2] as { grouped: boolean }).grouped, true);
  assert.equal((rows[3] as { grouped: boolean }).grouped, false);
});

test("buildTranscriptRows: notices and prompts break grouping and pass through as their own row", () => {
  const entries: TranscriptEntry[] = [
    msg("a", 1, 0, "forge", "send-message"),
    { id: "n", kind: "notice", seq: 2, timestampMs: 500, content: "note" },
    msg("b", 3, 1000, "forge", "send-message"),
  ];
  const rows = buildTranscriptRows(entries);
  const kinds = rows.map((row) => row.type);
  assert.deepEqual(kinds, ["date", "message", "notice", "message"]);
  assert.equal((rows[3] as { grouped: boolean }).grouped, false);
});

test("buildTranscriptRows: drops a superseded prompt entry entirely", () => {
  const entries: TranscriptEntry[] = [{ id: "p", kind: "prompt", seq: 1, timestampMs: 0, prompt: { question: "q", options: [], signature: "s" }, status: "superseded" }];
  assert.deepEqual(buildTranscriptRows(entries), []);
});

test("buildTranscriptRows: a day boundary starts a fresh group even for the same author", () => {
  const d1 = new Date(2024, 0, 1, 23, 59, 0).getTime();
  const d2 = new Date(2024, 0, 2, 0, 1, 0).getTime();
  const entries = [msg("a", 1, d1, "forge", "send-message"), msg("b", 2, d2, "forge", "send-message")];
  const rows = buildTranscriptRows(entries);
  assert.deepEqual(
    rows.map((r) => r.type),
    ["date", "message", "date", "message"],
  );
});
