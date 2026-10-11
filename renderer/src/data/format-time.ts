/** Locale-aware clock formatting for sidebar rows / message timestamps (`4:54 PM` / `오후 4:54`).
 * A thin wrapper over `Intl.DateTimeFormat` so call sites don't each pick their own
 * locale tag -- kept pure (takes `timestampMs` + `Locale`, no `Date.now()` inside) so it's testable
 * without faking the clock. */
import type { Locale } from "../i18n/locale.ts";

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", ko: "ko-KR" };

export function formatClockTime(timestampMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(timestampMs));
}
