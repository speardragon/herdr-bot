import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTranscriptEntry, mergeTranscriptPage } from "../src/data/transcript-merge.ts";
import type { TranscriptEntry } from "../src/data/types.ts";

function e(id: string, seq: number): TranscriptEntry {
  return { id, kind: "message", seq, timestampMs: seq * 1000 };
}

test("mergeTranscriptPage combines and sorts by seq ascending", () => {
  const existing = [e("b", 2), e("c", 3)];
  const page = [e("a", 1), e("b", 2)];
  const merged = mergeTranscriptPage(existing, page);
  assert.deepEqual(merged.map((entry) => entry.id), ["a", "b", "c"]);
});

test("mergeTranscriptPage lets the page's copy of a shared id win", () => {
  const existing = [{ ...e("a", 1), content: "old" }];
  const page = [{ ...e("a", 1), content: "new" }];
  const merged = mergeTranscriptPage(existing, page);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.content, "new");
});

test("applyTranscriptEntry inserts a new id in seq order", () => {
  const existing = [e("a", 1), e("c", 3)];
  const next = applyTranscriptEntry(existing, e("b", 2));
  assert.deepEqual(next.map((entry) => entry.id), ["a", "b", "c"]);
});

test("applyTranscriptEntry replaces an existing id in place", () => {
  const existing = [e("a", 1), { ...e("b", 2), content: "old" }];
  const next = applyTranscriptEntry(existing, { ...e("b", 2), content: "new" });
  assert.equal(next.length, 2);
  assert.equal(next[1]!.content, "new");
});
