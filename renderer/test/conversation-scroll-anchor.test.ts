import { test } from "node:test";
import assert from "node:assert/strict";
import { isNearBottom, isNearTop, olderPageScrollAdjustment } from "../src/features/conversation/scroll-anchor.ts";

test("isNearBottom: true when within the threshold of the bottom", () => {
  assert.equal(isNearBottom(900, 1000, 100), true); // 1000 - (900+100) = 0
  assert.equal(isNearBottom(850, 1000, 100), true); // distance 50 <= 80
  assert.equal(isNearBottom(700, 1000, 100), false); // distance 200 > 80
});

test("isNearBottom: respects a custom threshold", () => {
  assert.equal(isNearBottom(700, 1000, 100, 300), true);
});

test("olderPageScrollAdjustment: returns the grown height, never negative", () => {
  assert.equal(olderPageScrollAdjustment(1000, 1800), 800);
  assert.equal(olderPageScrollAdjustment(1000, 1000), 0);
  assert.equal(olderPageScrollAdjustment(1800, 1000), 0);
});

test("isNearTop: true at or below the threshold", () => {
  assert.equal(isNearTop(0), true);
  assert.equal(isNearTop(80), true);
  assert.equal(isNearTop(81), false);
});
