/**
 * Turns a flat, ascending-by-`seq` entry list into the rows the transcript actually renders: date
 * separators, grouped consecutive same-author message runs (hide the repeated avatar/name label in
 * rooms when grouping consecutive messages), and everything else (notice,
 * prompt, unknown kinds) passed through as its own row. A `superseded` prompt entry (an
 * old bug's dead duplicate, per the host's own guidance) is dropped entirely, never a row.
 *
 * Pure, DOM-free -- unit tested directly with `node --test`.
 */
import { getAuthor, getPromptStatus, getRawText, isNotice, isPromptEntry, isRenderableMessage } from "./entry-shapes.ts";
import type { TranscriptEntry } from "../../data/types.ts";

/** A new date separator is inserted before the first entry, whenever the calendar day changes, or
 * whenever more than this many ms have passed since the previous rendered entry -- it appears
 * whenever there's a meaningful time gap, acting more like a last-activity timestamp before a burst of
 * messages than a pure date divider. */
export const DATE_SEPARATOR_GAP_MS = 10 * 60 * 1000;

/** Two consecutive message entries collapse into one visual group (shared avatar/name label) when they
 * share an author and kind and arrive within this many ms of each other. */
export const GROUP_GAP_MS = 5 * 60 * 1000;

export function startOfDay(timestampMs: number): number {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function shouldShowDateSeparator(previous: TranscriptEntry | null, current: TranscriptEntry, gapMs: number = DATE_SEPARATOR_GAP_MS): boolean {
  if (previous == null) return true;
  if (startOfDay(previous.timestampMs) !== startOfDay(current.timestampMs)) return true;
  return current.timestampMs - previous.timestampMs > gapMs;
}

function sameAuthor(a: TranscriptEntry, b: TranscriptEntry): boolean {
  if (a.kind !== b.kind) return false;
  const authorA = getAuthor(a);
  const authorB = getAuthor(b);
  if (authorA == null || authorB == null) return authorA == null && authorB == null;
  return authorA.id === authorB.id;
}

export function shouldGroupWithPrevious(previous: TranscriptEntry | null, current: TranscriptEntry, gapMs: number = GROUP_GAP_MS): boolean {
  if (previous == null) return false;
  if (!isRenderableMessage(previous) || !isRenderableMessage(current)) return false;
  if (!sameAuthor(previous, current)) return false;
  return current.timestampMs - previous.timestampMs <= gapMs;
}

export type TranscriptRow =
  | { readonly type: "date"; readonly key: string; readonly timestampMs: number }
  | { readonly type: "message"; readonly key: string; readonly entry: TranscriptEntry; readonly grouped: boolean }
  | { readonly type: "notice"; readonly key: string; readonly entry: TranscriptEntry }
  | { readonly type: "prompt"; readonly key: string; readonly entry: TranscriptEntry };

/** Builds the full row list for a transcript. `grouped: true` on a message row means "same author/kind as
 * the row immediately above, hide the repeated avatar/name label" -- a date separator or a non-message
 * row (notice/prompt) in between always breaks a group, since `previous` below only ever looks at the
 * last *message* entry (not the last row): grouping is about
 * consecutive messages specifically. */
export function buildTranscriptRows(entries: readonly TranscriptEntry[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let previousMessage: TranscriptEntry | null = null;
  let previousRendered: TranscriptEntry | null = null;

  for (const entry of entries) {
    if (isPromptEntry(entry) && getPromptStatus(entry) === "superseded") continue;
    if (getRawText(entry) == null && !isPromptEntry(entry)) continue;

    if (shouldShowDateSeparator(previousRendered, entry)) {
      rows.push({ type: "date", key: `date-${entry.id}`, timestampMs: entry.timestampMs });
      previousMessage = null;
    }

    if (isRenderableMessage(entry)) {
      rows.push({ type: "message", key: entry.id, entry, grouped: shouldGroupWithPrevious(previousMessage, entry) });
      previousMessage = entry;
    } else if (isNotice(entry)) {
      rows.push({ type: "notice", key: entry.id, entry });
      previousMessage = null;
    } else if (isPromptEntry(entry)) {
      rows.push({ type: "prompt", key: entry.id, entry });
      previousMessage = null;
    } else {
      previousMessage = null;
    }
    previousRendered = entry;
  }

  return rows;
}
