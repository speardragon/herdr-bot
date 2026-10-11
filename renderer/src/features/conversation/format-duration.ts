/**
 * Locale-aware short duration formatting for the "Late reply +Ns" badge. A literal `+360초`
 * would leak the host's raw millisecond value with a hardcoded Korean unit -- only the
 * *value* (`lateAfterMs`) is real, the unit must be locale-formatted properly
 * rather than copied. Pure, DOM-free -- unit tested directly with `node --test`.
 */
import type { Locale } from "../../i18n/locale.ts";

const UNITS: Record<Locale, { readonly seconds: string; readonly minutes: string; readonly hours: string }> = {
  en: { seconds: "s", minutes: "m", hours: "h" },
  ko: { seconds: "초", minutes: "분", hours: "시간" },
};

/** `360_000` (ms) -> `"6m"` / `"6분"`; under a minute -> seconds; an hour or more -> hours (rounded down,
 * so "late by 90 minutes" reads as "1h" rather than a confusingly large minute count). */
export function formatDurationShort(ms: number, locale: Locale): string {
  const unit = UNITS[locale];
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}${unit.seconds}`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}${unit.minutes}`;
  const totalHours = Math.floor(totalMinutes / 60);
  return `${totalHours}${unit.hours}`;
}
