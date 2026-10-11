/**
 * Pure merge logic for transcript entries -- kept separate from the store reducer so it has no
 * dependency on the store shape and is trivial to unit test. `transcript.page` pages backward (newest
 * page first, then older pages via `beforeSeq`); live events (`transcript.entryAppended`/`entryUpdated`)
 * arrive one at a time, in any mix with paging. The only invariant callers can rely on afterward is:
 * entries are sorted ascending by `seq`, and every `id` appears at most once (the most recent copy wins).
 */
import type { TranscriptEntry } from "./types.ts";

function byId(entries: readonly TranscriptEntry[]): Map<string, TranscriptEntry> {
  const map = new Map<string, TranscriptEntry>();
  for (const entry of entries) map.set(entry.id, entry);
  return map;
}

function sortedBySeq(entries: Iterable<TranscriptEntry>): TranscriptEntry[] {
  return [...entries].sort((a, b) => a.seq - b.seq);
}

/** Combines an existing entry list with a freshly-loaded page (either the initial newest page or an
 * older page fetched via `beforeSeq`). Later entries (by `id`) always replace earlier ones, since a
 * page can legitimately re-include an entry the caller already had (e.g. the boundary row of an older
 * page overlapping the newest page). */
export function mergeTranscriptPage(existing: readonly TranscriptEntry[], page: readonly TranscriptEntry[]): TranscriptEntry[] {
  const merged = byId(existing);
  for (const entry of page) merged.set(entry.id, entry);
  return sortedBySeq(merged.values());
}

/** Applies a single `transcript.entryAppended`/`entryUpdated` event: inserts a new id in seq order, or
 * replaces an existing one in place. */
export function applyTranscriptEntry(existing: readonly TranscriptEntry[], entry: TranscriptEntry): TranscriptEntry[] {
  const index = existing.findIndex((candidate) => candidate.id === entry.id);
  if (index === -1) return sortedBySeq([...existing, entry]);
  const next = [...existing];
  next[index] = entry;
  // A rewritten entry's `seq` never changes in practice, but re-sort defensively rather than assume it.
  return sortedBySeq(next);
}
