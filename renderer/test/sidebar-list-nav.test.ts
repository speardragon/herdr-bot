import { test } from "node:test";
import assert from "node:assert/strict";
import { clampIndex, moveIndex } from "../src/features/sidebar/list-nav.ts";

test("moveIndex wraps forward past the end", () => {
  assert.equal(moveIndex(2, 1, 3), 0);
});

test("moveIndex wraps backward past the start", () => {
  assert.equal(moveIndex(0, -1, 3), 2);
});

test("moveIndex from -1 (no selection) with +1 lands on the first item", () => {
  assert.equal(moveIndex(-1, 1, 3), 0);
});

test("moveIndex returns -1 for an empty list", () => {
  assert.equal(moveIndex(0, 1, 0), -1);
});

test("clampIndex keeps an in-range index unchanged", () => {
  assert.equal(clampIndex(1, 3), 1);
});

test("clampIndex pulls an out-of-range index back to the last item", () => {
  assert.equal(clampIndex(5, 3), 2);
});

test("clampIndex returns 0 for a negative index when the list is non-empty", () => {
  assert.equal(clampIndex(-1, 3), 0);
});

test("clampIndex returns -1 once the list is empty", () => {
  assert.equal(clampIndex(2, 0), -1);
});
