/**
 * Compact "30m ago" / "30분 전" relative-time formatting for a palette result row's subtitle (e.g.
 * `In Checkout rate limits · 30m ago`). `Intl.RelativeTimeFormat`'s own output ("30 minutes ago")
 * is too verbose for this compact badge-like style, so this is a small hand-rolled formatter
 * instead -- pure (timestamp + "now" + locale all passed in, no `Date.now()` inside) so it's testable
 * without faking the clock.
 */
import type { Locale } from "../../i18n/locale.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatRelativeTime(timestampMs: number, nowMs: number, locale: Locale): string {
  const diffMs = Math.max(0, nowMs - timestampMs);
  const minutes = Math.round(diffMs / MINUTE_MS);

  if (minutes < 1) return locale === "ko" ? "방금 전" : "just now";
  if (minutes < 60) return locale === "ko" ? `${minutes}분 전` : `${minutes}m ago`;

  const hours = Math.round(diffMs / HOUR_MS);
  if (hours < 24) return locale === "ko" ? `${hours}시간 전` : `${hours}h ago`;

  const days = Math.round(diffMs / DAY_MS);
  return locale === "ko" ? `${days}일 전` : `${days}d ago`;
}
