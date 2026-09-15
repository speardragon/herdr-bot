import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSidebarTime } from "../src/production/sidebar-time.ts";

// herdr-bot: the sidebar row time mirrors Grok Bot's messenger-style stamp -- clock time for
// today, "어제"/"Yesterday", the weekday name for the rest of the past week, else a date.
// Fixtures are built with the local-time Date constructor so day boundaries are timezone-safe.

const NOW = new Date(2026, 8, 14, 15, 42).getTime(); // Mon 2026-09-14 15:42 local

test("same-day stamps render as a localized clock time", () => {
  const at = new Date(2026, 8, 14, 10, 21).getTime();
  assert.equal(formatSidebarTime(at, NOW, "ko"), "오전 10:21");
  assert.equal(formatSidebarTime(at, NOW, "en"), "10:21 AM");
});

test("a stamp from earlier today, even just after midnight, still shows the clock", () => {
  const at = new Date(2026, 8, 14, 0, 5).getTime();
  assert.equal(formatSidebarTime(at, NOW, "ko"), "오전 12:05");
});

test("yesterday renders the yesterday label regardless of hour", () => {
  const lateYesterday = new Date(2026, 8, 13, 23, 59).getTime();
  const earlyYesterday = new Date(2026, 8, 13, 0, 1).getTime();
  assert.equal(formatSidebarTime(lateYesterday, NOW, "ko"), "어제");
  assert.equal(formatSidebarTime(earlyYesterday, NOW, "en"), "Yesterday");
});

test("two to six days ago render the weekday name", () => {
  const friday = new Date(2026, 8, 11, 9, 0).getTime();
  const tuesday = new Date(2026, 8, 8, 9, 0).getTime(); // exactly six days ago
  assert.equal(formatSidebarTime(friday, NOW, "ko"), "금요일");
  assert.equal(formatSidebarTime(friday, NOW, "en"), "Friday");
  assert.equal(formatSidebarTime(tuesday, NOW, "ko"), "화요일");
});

test("seven or more days ago falls back to a month/day date, with the year once it differs", () => {
  const lastMonday = new Date(2026, 8, 7, 9, 0).getTime();
  const lastYear = new Date(2025, 11, 25, 9, 0).getTime();
  assert.equal(formatSidebarTime(lastMonday, NOW, "ko"), "9월 7일");
  assert.equal(formatSidebarTime(lastMonday, NOW, "en"), "Sep 7");
  assert.equal(formatSidebarTime(lastYear, NOW, "ko"), "2025. 12. 25.");
  assert.equal(formatSidebarTime(lastYear, NOW, "en"), "12/25/2025");
});

test("future or zero stamps never throw and clamp to the clock / date branches", () => {
  const future = NOW + 60_000;
  assert.equal(formatSidebarTime(future, NOW, "en"), "3:43 PM");
  assert.match(formatSidebarTime(0, NOW, "en"), /1970/);
});
