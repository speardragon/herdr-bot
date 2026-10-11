import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDurationShort } from "../src/features/conversation/format-duration.ts";

test("formats seconds under a minute", () => {
  assert.equal(formatDurationShort(45_000, "en"), "45s");
  assert.equal(formatDurationShort(45_000, "ko"), "45초");
});

test("formats minutes under an hour", () => {
  assert.equal(formatDurationShort(360_000, "en"), "6m");
  assert.equal(formatDurationShort(360_000, "ko"), "6분");
});

test("formats hours at 3600s and above", () => {
  assert.equal(formatDurationShort(3_600_000, "en"), "1h");
  assert.equal(formatDurationShort(5_400_000, "en"), "1h");
});

test("clamps negative input to zero", () => {
  assert.equal(formatDurationShort(-500, "en"), "0s");
});
