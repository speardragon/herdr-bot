import { test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionRetry } from "../src/herdr/subscription-retry.ts";

test("polls cannot bypass reconnect delay", () => {
  const retry = new SubscriptionRetry();
  retry.fail(0);
  for (const now of [5_000, 10_000, 29_999]) assert.equal(retry.canAttempt(now), false);
  assert.equal(retry.canAttempt(30_000), true);
  retry.fail(30_000);
  assert.equal(retry.canAttempt(89_999), false);
  retry.ready();
  assert.equal(retry.canAttempt(30_001), true);
});
