/**
 * Small, dependency-free helpers for the read-receipt controller's seq bookkeeping. Deliberately kept
 * out of model.ts: model.ts pulls in the full "recovered/features/conversation" import graph (several
 * of those modules use extensionless imports that only resolve under bundler/tsc resolution, not under
 * Node's native module loader), so importing model.ts directly from a `node --test` file fails. These
 * two functions have no such dependencies and are safe to unit test directly.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The read-receipt controller acks the max seq of a page the renderer actually loaded/rendered --
 * never the summary's latest seq, and never a server request timestamp. Projected transcript entries
 * drop the host's numeric `seq`, so this reads it straight off the raw coordinator entries before they
 * are projected.
 */
export function maxEntrySeq(entries: readonly unknown[]): number {
  let max = 0;
  for (const entry of entries) {
    if (isRecord(entry) && typeof entry.seq === "number" && Number.isFinite(entry.seq) && entry.seq > max) max = entry.seq;
  }
  return max;
}

/**
 * Merges a freshly-refetched (already-projected) transcript page into a cached transcript by entry
 * id, for a cache-revisit resync (a chat reopened from cache re-syncs with the host in case a live
 * transcript event was missed, e.g. across a transport disconnect/reconnect while it was backgrounded).
 *
 * Purely additive and order-preserving: every existing entry is kept, untouched, at its existing
 * position -- an entry already in the cache is never replaced by the fetched copy, so a stale/late
 * resync response can never clobber something the live event stream has since updated. Only entries
 * whose id is not already present are appended, in the fetched page's (chronological) order.
 */
export function mergeTranscriptPageById<T extends { readonly id: string }>(existing: T[], fetched: readonly T[]): T[] {
  const existingIds = new Set(existing.map((entry) => entry.id));
  const additions = fetched.filter((entry) => !existingIds.has(entry.id));
  // Reference-equal when nothing new arrived, so a caller (e.g. setEntriesByAgent's updater) can skip
  // re-rendering the whole transcript on a resync that found nothing to merge.
  return additions.length === 0 ? existing : [...existing, ...additions];
}
