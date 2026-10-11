import { test } from "node:test";
import assert from "node:assert/strict";
import { dateSeparatorKind, formatDateSeparatorText } from "../src/features/conversation/date-separator-label.ts";

const NOON_JAN_2 = new Date(2024, 0, 2, 12, 0, 0).getTime();

test("dateSeparatorKind: today/yesterday/older", () => {
  assert.equal(dateSeparatorKind(NOON_JAN_2, NOON_JAN_2), "today");
  assert.equal(dateSeparatorKind(new Date(2024, 0, 1, 9, 0, 0).getTime(), NOON_JAN_2), "yesterday");
  assert.equal(dateSeparatorKind(new Date(2023, 11, 20).getTime(), NOON_JAN_2), "date");
});

test("formatDateSeparatorText: delegates to the right translate key for today/yesterday", () => {
  const translate = (key: string, vars?: Record<string, string>) => `${key}:${vars?.time ?? ""}`;
  assert.equal(formatDateSeparatorText(NOON_JAN_2, NOON_JAN_2, "en", translate), "conversation.dateSeparator.today:12:00 PM");
  const yesterday = new Date(2024, 0, 1, 9, 0, 0).getTime();
  assert.equal(formatDateSeparatorText(yesterday, NOON_JAN_2, "en", translate), "conversation.dateSeparator.yesterday:9:00 AM");
});

test("formatDateSeparatorText: falls back to a plain calendar date otherwise", () => {
  const translate = () => "unused";
  const text = formatDateSeparatorText(new Date(2023, 11, 20).getTime(), NOON_JAN_2, "en", translate);
  assert.match(text, /December 20, 2023/);
});
