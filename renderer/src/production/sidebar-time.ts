import type { Locale } from "./locale";

const DAY_MS = 86_400_000;
const INTL_TAG: Record<Locale, string> = { ko: "ko-KR", en: "en-US" };
const YESTERDAY: Record<Locale, string> = { ko: "어제", en: "Yesterday" };

function startOfLocalDay(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function format(at: number, locale: Locale, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(INTL_TAG[locale], options).format(new Date(at));
}

/**
 * Messenger-style sidebar timestamp (reference: Grok Bot chat list). Same local day → clock time
 * ("오전 10:21" / "10:21 AM"); yesterday → "어제" / "Yesterday"; two to six days back → weekday
 * name; anything older → month/day, with the year once it differs from `now`'s year. Pure and
 * DOM-free: the caller passes `now` and the active locale so it stays testable under node:test.
 */
export function formatSidebarTime(at: number, now: number, locale: Locale): string {
  const dayDelta = Math.round((startOfLocalDay(now) - startOfLocalDay(at)) / DAY_MS);
  if (dayDelta <= 0) return format(at, locale, { hour: "numeric", minute: "2-digit", hour12: true });
  if (dayDelta === 1) return YESTERDAY[locale];
  if (dayDelta <= 6) return format(at, locale, { weekday: "long" });
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? format(at, locale, { month: "short", day: "numeric" })
    : format(at, locale, { year: "numeric", month: "numeric", day: "numeric" });
}
