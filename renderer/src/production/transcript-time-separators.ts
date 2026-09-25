import type { ConversationTranscriptEntry } from "../recovered/features/conversation/workspace/model";
import type { Locale } from "./locale";

/** herdr-bot (Task 10, plan bot-collaboration-and-launch-settings): pure projection that inserts
 * `time-separator` entries into a transcript's *displayed* entry list -- before the first entry,
 * before any entry whose local calendar date differs from the previous displayed entry, and before
 * any entry that lands >=30 minutes after the previous displayed entry. Structural entries with no
 * `timestampMs` (a divider, or a previously-inserted separator) are passed through untouched and
 * never participate in the gap/date math, and any separator already present in `entries` is dropped
 * first so this stays idempotent when re-run on a growing/paginated list. Kept dependency-free (no
 * React/DOM) so it is testable without a browser harness; ProductionRenderer.tsx only pipes its
 * transcript projection through this before handing it to <ConversationTranscript>. */

export const TIME_GAP_MS = 30 * 60 * 1000;

const DAY_MS = 86_400_000;
const INTL_TAG: Record<Locale, string> = { ko: "ko-KR", en: "en-US" };
const TODAY_LABEL: Record<Locale, string> = { ko: "오늘", en: "Today" };
const YESTERDAY_LABEL: Record<Locale, string> = { ko: "어제", en: "Yesterday" };

/** The entry's local (app runtime timezone) calendar date as an opaque comparison key. */
export function localDateKey(atMs: number): string {
  const date = new Date(atMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function shouldInsertTimeSeparator(previousMs: number | null, currentMs: number): boolean {
  if (previousMs == null) return true;
  return localDateKey(previousMs) !== localDateKey(currentMs) || currentMs - previousMs >= TIME_GAP_MS;
}

function startOfLocalDay(atMs: number): number {
  const date = new Date(atMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatClockTime(atMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_TAG[locale], { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(atMs));
}

/** Mirrors sidebar-time.ts's month/day (and year-once-it-differs) date convention, combined here
 * with the clock time since a separator label always carries both. */
function formatDatePart(atMs: number, nowMs: number, locale: Locale): string {
  const sameYear = new Date(atMs).getFullYear() === new Date(nowMs).getFullYear();
  const options: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "numeric", day: "numeric" };
  return new Intl.DateTimeFormat(INTL_TAG[locale], options).format(new Date(atMs));
}

function formatTimeSeparatorLabel(atMs: number, nowMs: number, locale: Locale): string {
  const dayDelta = Math.round((startOfLocalDay(nowMs) - startOfLocalDay(atMs)) / DAY_MS);
  const clock = formatClockTime(atMs, locale);
  if (dayDelta === 0) return `${TODAY_LABEL[locale]} ${clock}`;
  if (dayDelta === 1) return `${YESTERDAY_LABEL[locale]} ${clock}`;
  return `${formatDatePart(atMs, nowMs, locale)} ${clock}`;
}

/** Only entries that actually carry a `timestampMs` count as "displayed" for gap/date purposes --
 * structural kinds (`time-separator`, `unread-divider`) and any card entry missing the optional
 * field are skipped, both for inserting a separator before them and for advancing the running
 * "previous displayed entry" used by the next comparison. */
function displayedTimestampMs(entry: ConversationTranscriptEntry): number | null {
  if (entry.kind === "time-separator" || entry.kind === "unread-divider") return null;
  const timestampMs = (entry as { timestampMs?: unknown }).timestampMs;
  return typeof timestampMs === "number" && Number.isFinite(timestampMs) ? timestampMs : null;
}

export function withTranscriptTimeSeparators(
  entries: readonly ConversationTranscriptEntry[],
  nowMs: number,
  locale: Locale
): ConversationTranscriptEntry[] {
  const result: ConversationTranscriptEntry[] = [];
  let previousMs: number | null = null;
  for (const entry of entries) {
    // Recompute purely from the real content entries: a previously-inserted separator must never
    // be treated as the "previous displayed entry", so drop it and let it be regenerated below.
    if (entry.kind === "time-separator") continue;
    const timestampMs = displayedTimestampMs(entry);
    if (timestampMs != null && shouldInsertTimeSeparator(previousMs, timestampMs)) {
      result.push({ kind: "time-separator", id: `time:${entry.id}`, label: formatTimeSeparatorLabel(timestampMs, nowMs, locale) });
    }
    result.push(entry);
    if (timestampMs != null) previousMs = timestampMs;
  }
  return result;
}
