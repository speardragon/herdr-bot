import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRelativeTime } from "../src/features/palette/relative-time.ts";

const NOW = Date.parse("2026-01-01T12:00:00Z");

test("formatRelativeTime: under a minute reads 'just now' / '방금 전'", () => {
  assert.equal(formatRelativeTime(NOW - 10_000, NOW, "en"), "just now");
  assert.equal(formatRelativeTime(NOW - 10_000, NOW, "ko"), "방금 전");
});

test("formatRelativeTime: minutes", () => {
  assert.equal(formatRelativeTime(NOW - 30 * 60_000, NOW, "en"), "30m ago");
  assert.equal(formatRelativeTime(NOW - 30 * 60_000, NOW, "ko"), "30분 전");
});

test("formatRelativeTime: hours", () => {
  assert.equal(formatRelativeTime(NOW - 3 * 3_600_000, NOW, "en"), "3h ago");
});

test("formatRelativeTime: days", () => {
  assert.equal(formatRelativeTime(NOW - 2 * 86_400_000, NOW, "en"), "2d ago");
});

test("formatRelativeTime: never produces a negative duration for a future timestamp", () => {
  assert.equal(formatRelativeTime(NOW + 60_000, NOW, "en"), "just now");
});
