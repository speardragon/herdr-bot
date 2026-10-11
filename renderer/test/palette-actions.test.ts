import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE_ACTIONS, filterActions } from "../src/features/palette/actions.ts";

const LABELS = new Map(PALETTE_ACTIONS.map((action) => [action.id, action.labelKey.split(".").at(-1) ?? action.id]));

test("filterActions with an empty query returns every action unchanged", () => {
  assert.deepEqual(filterActions(PALETTE_ACTIONS, LABELS, ""), PALETTE_ACTIONS);
});

test("filterActions matches case-insensitively against the resolved label", () => {
  const result = filterActions(PALETTE_ACTIONS, LABELS, "NEWBOT");
  assert.deepEqual(result.map((a) => a.id), ["newBot"]);
});

test("filterActions returns nothing for a query matching no action", () => {
  assert.deepEqual(filterActions(PALETTE_ACTIONS, LABELS, "zzz-no-match"), []);
});
