import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClockTime } from "../src/data/format-time.ts";

test("formatClockTime renders a 12-hour EN clock", () => {
  const timestamp = new Date(2026, 0, 1, 16, 54).getTime();
  assert.equal(formatClockTime(timestamp, "en"), "4:54 PM");
});

test("formatClockTime renders a Korean 오전/오후 clock", () => {
  const timestamp = new Date(2026, 0, 1, 16, 54).getTime();
  const formatted = formatClockTime(timestamp, "ko");
  assert.ok(formatted.includes("54"));
  assert.ok(formatted.includes("오후"));
});
