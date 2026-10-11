import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_TYPEAHEAD,
  firstEnabledIndex,
  lastEnabledIndex,
  moveActiveIndex,
  typeaheadAppend,
  typeaheadMatch,
} from "../src/primitives/select-logic.ts";
import type { SelectLogicOption } from "../src/primitives/select-logic.ts";

function options(...labels: readonly string[]): SelectLogicOption[] {
  return labels.map((label) => ({ label }));
}

function withDisabled(labels: readonly string[], disabledLabels: readonly string[]): SelectLogicOption[] {
  return labels.map((label) => ({ label, disabled: disabledLabels.includes(label) }));
}

// ---- moveActiveIndex ----

test("moveActiveIndex: steps forward by one", () => {
  assert.equal(moveActiveIndex(options("a", "b", "c"), 0, 1), 1);
});

test("moveActiveIndex: steps backward by one", () => {
  assert.equal(moveActiveIndex(options("a", "b", "c"), 1, -1), 0);
});

test("moveActiveIndex: wraps forward past the end", () => {
  assert.equal(moveActiveIndex(options("a", "b", "c"), 2, 1), 0);
});

test("moveActiveIndex: wraps backward past the start", () => {
  assert.equal(moveActiveIndex(options("a", "b", "c"), 0, -1), 2);
});

test("moveActiveIndex: from -1 (no active option) lands on the first option going forward", () => {
  assert.equal(moveActiveIndex(options("a", "b", "c"), -1, 1), 0);
});

test("moveActiveIndex: returns -1 for an empty list", () => {
  assert.equal(moveActiveIndex([], 0, 1), -1);
});

test("moveActiveIndex: skips a disabled option in the middle", () => {
  const opts = withDisabled(["a", "b", "c"], ["b"]);
  assert.equal(moveActiveIndex(opts, 0, 1), 2, "b is disabled, so forward from a lands on c");
  assert.equal(moveActiveIndex(opts, 2, -1), 0, "and backward from c lands back on a");
});

test("moveActiveIndex: skips disabled options even while wrapping around", () => {
  const opts = withDisabled(["a", "b", "c"], ["a", "c"]);
  assert.equal(moveActiveIndex(opts, 1, 1), 1, "only b is enabled, so stepping from it returns to itself");
});

test("moveActiveIndex: returns the starting index unchanged when every option is disabled", () => {
  const opts = withDisabled(["a", "b"], ["a", "b"]);
  assert.equal(moveActiveIndex(opts, 0, 1), 0);
});

// ---- firstEnabledIndex / lastEnabledIndex ----

test("firstEnabledIndex: the first option when nothing is disabled", () => {
  assert.equal(firstEnabledIndex(options("a", "b", "c")), 0);
});

test("firstEnabledIndex: skips a disabled leading option (Home)", () => {
  assert.equal(firstEnabledIndex(withDisabled(["a", "b", "c"], ["a"])), 1);
});

test("firstEnabledIndex: -1 when every option is disabled", () => {
  assert.equal(firstEnabledIndex(withDisabled(["a", "b"], ["a", "b"])), -1);
});

test("lastEnabledIndex: the last option when nothing is disabled", () => {
  assert.equal(lastEnabledIndex(options("a", "b", "c")), 2);
});

test("lastEnabledIndex: skips a disabled trailing option (End)", () => {
  assert.equal(lastEnabledIndex(withDisabled(["a", "b", "c"], ["c"])), 1);
});

test("lastEnabledIndex: -1 when every option is disabled", () => {
  assert.equal(lastEnabledIndex(withDisabled(["a", "b"], ["a", "b"])), -1);
});

// ---- typeaheadAppend ----

test("typeaheadAppend: starts a fresh query from empty state", () => {
  const next = typeaheadAppend(EMPTY_TYPEAHEAD, "d", 0);
  assert.equal(next.query, "d");
});

test("typeaheadAppend: accumulates distinct characters typed quickly", () => {
  const first = typeaheadAppend(EMPTY_TYPEAHEAD, "d", 1000);
  const second = typeaheadAppend(first, "a", 1100);
  assert.equal(second.query, "da");
});

test("typeaheadAppend: resets the query after a long pause", () => {
  const first = typeaheadAppend(EMPTY_TYPEAHEAD, "d", 1000);
  const second = typeaheadAppend(first, "x", 1000 + 10_000);
  assert.equal(second.query, "x");
});

test("typeaheadAppend: repeating the same character keeps a 1-character query instead of accumulating", () => {
  const first = typeaheadAppend(EMPTY_TYPEAHEAD, "a", 1000);
  const second = typeaheadAppend(first, "a", 1100);
  const third = typeaheadAppend(second, "a", 1200);
  assert.equal(third.query, "a");
});

// ---- typeaheadMatch ----

test("typeaheadMatch: jumps to the first option starting with the query", () => {
  const opts = options("Ask before edits", "Allow automatically", "Dark");
  assert.equal(typeaheadMatch(opts, "d", 0), 2);
});

test("typeaheadMatch: is case-insensitive", () => {
  const opts = options("Ask", "Dark");
  assert.equal(typeaheadMatch(opts, "D", 0), 1);
});

test("typeaheadMatch: searches forward from just after the active option, wrapping around", () => {
  const opts = options("Ask", "Auto", "Agent's default");
  // active = "Auto" (index 1); searching for "a" should skip itself and land on "Agent's default",
  // not jump backward to "Ask".
  assert.equal(typeaheadMatch(opts, "a", 1), 2);
});

test("typeaheadMatch: repeated single-character queries cycle through every match", () => {
  const opts = options("Ask", "Auto", "Agent's default");
  const first = typeaheadMatch(opts, "a", -1);
  assert.equal(first, 0);
  const second = typeaheadMatch(opts, "a", first);
  assert.equal(second, 1);
  const third = typeaheadMatch(opts, "a", second);
  assert.equal(third, 2);
  const fourth = typeaheadMatch(opts, "a", third);
  assert.equal(fourth, 0, "cycles back around to the first match");
});

test("typeaheadMatch: skips a disabled option even if its label matches", () => {
  const opts = withDisabled(["Ask", "Auto"], ["Auto"]);
  assert.equal(typeaheadMatch(opts, "a", -1), 0, "Auto is disabled, so only Ask can match");
});

test("typeaheadMatch: returns the active index unchanged when nothing matches", () => {
  const opts = options("Ask", "Auto");
  assert.equal(typeaheadMatch(opts, "z", 1), 1);
});

test("typeaheadMatch: returns the active index unchanged for an empty query", () => {
  const opts = options("Ask", "Auto");
  assert.equal(typeaheadMatch(opts, "", 1), 1);
});
