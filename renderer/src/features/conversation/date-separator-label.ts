/**
 * The date separator's label text (e.g. `Today 4:30 PM`). Pure -- takes `now` explicitly rather
 * than reading `Date.now()` so it's testable without faking the clock.
 */
import { formatClockTime } from "../../data/format-time.ts";
import type { Locale } from "../../i18n/locale.ts";
import { startOfDay } from "./group-messages.ts";

export type DateSeparatorKind = "today" | "yesterday" | "date";

export function dateSeparatorKind(timestampMs: number, nowMs: number): DateSeparatorKind {
  const day = startOfDay(timestampMs);
  const today = startOfDay(nowMs);
  if (day === today) return "today";
  if (today - day === 24 * 60 * 60 * 1000) return "yesterday";
  return "date";
}

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", ko: "ko-KR" };

/** The plain calendar-date fallback (neither today nor yesterday) -- locale-formatted, no time-of-day
 * (the time is only meaningful for the "burst of messages just now" today/yesterday cases; this acts
 * more like a last-activity timestamp than a pure date divider). */
export function formatCalendarDate(timestampMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", day: "numeric", year: "numeric" }).format(new Date(timestampMs));
}

export function formatDateSeparatorText(timestampMs: number, nowMs: number, locale: Locale, translate: (key: string, vars?: Record<string, string>) => string): string {
  const kind = dateSeparatorKind(timestampMs, nowMs);
  const time = formatClockTime(timestampMs, locale);
  if (kind === "today") return translate("conversation.dateSeparator.today", { time });
  if (kind === "yesterday") return translate("conversation.dateSeparator.yesterday", { time });
  return formatCalendarDate(timestampMs, locale);
}
