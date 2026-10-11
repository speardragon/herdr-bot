import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightSnippet } from "../src/features/palette/highlight-snippet.ts";

test("highlightSnippet splits before/match/after around a case-insensitive match", () => {
  const segments = highlightSnippet("every 429 carries Retry-After.", "retry-after");
  assert.deepEqual(segments, [
    { text: "every 429 carries ", match: false },
    { text: "Retry-After", match: true },
    { text: ".", match: false },
  ]);
});

test("highlightSnippet with a match at the very start omits the leading empty segment", () => {
  const segments = highlightSnippet("Retry-After carries the wait.", "Retry-After");
  assert.deepEqual(segments, [
    { text: "Retry-After", match: true },
    { text: " carries the wait.", match: false },
  ]);
});

test("highlightSnippet with a match at the very end omits the trailing empty segment", () => {
  const segments = highlightSnippet("the header is Retry-After", "Retry-After");
  assert.deepEqual(segments, [
    { text: "the header is ", match: false },
    { text: "Retry-After", match: true },
  ]);
});

test("highlightSnippet degrades to one plain segment when the query isn't literally present", () => {
  assert.deepEqual(highlightSnippet("some snippet text", "nope"), [{ text: "some snippet text", match: false }]);
});

test("highlightSnippet with an empty query returns the whole snippet unmatched", () => {
  assert.deepEqual(highlightSnippet("some snippet text", ""), [{ text: "some snippet text", match: false }]);
});
