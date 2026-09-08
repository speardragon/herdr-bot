import { test } from "node:test";
import assert from "node:assert/strict";

test("node runs TypeScript tests directly (type stripping)", () => {
  const value: number = 1;
  assert.equal(value + 1, 2);
});
