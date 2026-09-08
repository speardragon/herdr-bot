import type { ConversationTranscriptEntry } from "./model";

/**
 * Cursor and viewport state for the shipped transcript older-history flow.
 * The coordinator returns entries in chronological order and uses
 * `nextBeforeSeq` as the exclusive older-page cursor.
 *
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5692943 (cursor/page merge helpers)
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5705748 (loadOlder request fencing and error state)
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5312453 (root hasOlder/isLoadingOlder/loadOlder handoff)
 */

export type TranscriptHistoryCursor =
  | { kind: "unprobed" }
  | { kind: "more"; beforeSeq: number }
  | { kind: "exhausted" }
  | { kind: "unavailable" };

export interface TranscriptHistoryPage {
  entries: readonly ConversationTranscriptEntry[];
  nextBeforeSeq?: number;
}

export interface TranscriptHistoryRequest {
  id: string;
  limit: number;
  beforeSeq: number;
}

export type TranscriptHistoryFetcher = (request: TranscriptHistoryRequest) => Promise<TranscriptHistoryPage>;

export interface TranscriptViewport {
  scrollTop: number;
  scrollHeight: number;
}

export interface TranscriptPaginationSnapshot {
  generation: number;
  accountSlot: string | null;
  agentId: string | null;
  entries: readonly ConversationTranscriptEntry[];
  cursor: TranscriptHistoryCursor;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  olderFailure: unknown | null;
}

/**
 * Typed boundary for the root owner. The root installs the authoritative
 * initial page, subscribes to this snapshot, passes its fields to the
 * transcript view, and calls onEntriesCommitted from its layout-commit path.
 */
export interface TranscriptPaginationRootHandoff {
  getSnapshot(): TranscriptPaginationSnapshot;
  subscribe(listener: () => void): () => void;
  setScope(accountSlot: string | null, agentId: string | null): void;
  installInitialPage(page: TranscriptHistoryPage): boolean;
  loadOlder(): Promise<void>;
  bindViewport(viewport: TranscriptViewport | null): void;
  onEntriesCommitted(): boolean;
  reset(): void;
  dispose(): void;
}

export interface TranscriptPaginationControllerOptions {
  fetchPage: TranscriptHistoryFetcher;
  pageLimit?: number;
  accountSlot?: string | null;
  agentId?: string | null;
}

const DEFAULT_PAGE_LIMIT = 200;

const EMPTY_CURSOR: TranscriptHistoryCursor = { kind: "unprobed" };

function cursorFromNextBeforeSeq(nextBeforeSeq: number | undefined): TranscriptHistoryCursor {
  return typeof nextBeforeSeq === "number" && Number.isFinite(nextBeforeSeq)
    ? { kind: "more", beforeSeq: nextBeforeSeq }
    : { kind: "exhausted" };
}

function isCapabilityUnavailableFailure(error: unknown): boolean {
  if (typeof error !== "object" || error == null) return false;
  const candidate = error as { code?: unknown; failure?: { code?: unknown } };
  return candidate.code === "source/capability-unavailable"
    || candidate.failure?.code === "source/capability-unavailable";
}

function uniqueEntries(entries: readonly ConversationTranscriptEntry[], excludedIds = new Set<string>()): ConversationTranscriptEntry[] {
  const seen = new Set(excludedIds);
  const result: ConversationTranscriptEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

export function mergeOlderTranscriptEntries(
  currentEntries: readonly ConversationTranscriptEntry[],
  olderEntries: readonly ConversationTranscriptEntry[]
): ConversationTranscriptEntry[] {
  const currentIds = new Set(currentEntries.map((entry) => entry.id));
  return [...uniqueEntries(olderEntries, currentIds), ...uniqueEntries(currentEntries)];
}

export function createTranscriptPaginationController(
  options: TranscriptPaginationControllerOptions
): TranscriptPaginationRootHandoff {
  const listeners = new Set<() => void>();
  const pageLimit = Number.isSafeInteger(options.pageLimit) && (options.pageLimit ?? 0) > 0
    ? options.pageLimit as number
    : DEFAULT_PAGE_LIMIT;
  let accountSlot = options.accountSlot ?? null;
  let agentId = options.agentId ?? null;
  let entries: readonly ConversationTranscriptEntry[] = [];
  let cursor: TranscriptHistoryCursor = EMPTY_CURSOR;
  let olderFailure: unknown | null = null;
  let generation = 0;
  let pageGeneration = 0;
  let requestGeneration = 0;
  let inFlight: Promise<void> | null = null;
  let viewport: TranscriptViewport | null = null;
  let pendingAnchor: { generation: number; pageGeneration: number; scrollTop: number; scrollHeight: number } | null = null;
  let disposed = false;

  const buildSnapshot = (): TranscriptPaginationSnapshot => ({
    generation,
    accountSlot,
    agentId,
    entries,
    cursor,
    hasOlder: cursor.kind === "unprobed" || cursor.kind === "more",
    isLoadingOlder: inFlight != null,
    olderFailure
  });
  let cachedSnapshot = buildSnapshot();

  const emit = () => {
    if (disposed) return;
    cachedSnapshot = buildSnapshot();
    for (const listener of [...listeners]) listener();
  };

  const isCurrentRequest = (requestId: number, requestPageGeneration: number, requestAgentId: string | null): boolean => (
    !disposed
    && requestId === requestGeneration
    && requestPageGeneration === pageGeneration
    && requestAgentId === agentId
  );

  const clearPageState = () => {
    entries = [];
    cursor = EMPTY_CURSOR;
    olderFailure = null;
    pendingAnchor = null;
  };

  return {
    getSnapshot: () => cachedSnapshot,

    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setScope(nextAccountSlot, nextAgentId) {
      if (disposed || (accountSlot === nextAccountSlot && agentId === nextAgentId)) return;
      generation += 1;
      pageGeneration += 1;
      requestGeneration += 1;
      accountSlot = nextAccountSlot;
      agentId = nextAgentId;
      inFlight = null;
      clearPageState();
      emit();
    },

    installInitialPage(page) {
      if (disposed) return false;
      pageGeneration += 1;
      requestGeneration += 1;
      inFlight = null;
      entries = uniqueEntries(page.entries);
      cursor = cursorFromNextBeforeSeq(page.nextBeforeSeq);
      olderFailure = null;
      pendingAnchor = null;
      emit();
      return true;
    },

    loadOlder() {
      if (disposed || agentId == null || cursor.kind !== "more") return Promise.resolve();
      if (inFlight != null) return inFlight;

      const requestId = ++requestGeneration;
      const requestPageGeneration = pageGeneration;
      const requestAgentId = agentId;
      const beforeSeq = cursor.beforeSeq;
      if (viewport != null && Number.isFinite(viewport.scrollTop) && Number.isFinite(viewport.scrollHeight)) {
        pendingAnchor = {
          generation,
          pageGeneration,
          scrollTop: viewport.scrollTop,
          scrollHeight: viewport.scrollHeight
        };
      } else pendingAnchor = null;
      olderFailure = null;

      const request = (async () => {
        try {
          const page = await options.fetchPage({ id: requestAgentId, limit: pageLimit, beforeSeq });
          if (!isCurrentRequest(requestId, requestPageGeneration, requestAgentId)) return;
          entries = mergeOlderTranscriptEntries(entries, page.entries);
          cursor = cursorFromNextBeforeSeq(page.nextBeforeSeq);
          olderFailure = null;
          emit();
        } catch (error) {
          if (!isCurrentRequest(requestId, requestPageGeneration, requestAgentId)) return;
          if (isCapabilityUnavailableFailure(error)) {
            cursor = { kind: "unavailable" };
            olderFailure = null;
          } else olderFailure = error;
          pendingAnchor = null;
          emit();
        } finally {
          if (requestId === requestGeneration) {
            inFlight = null;
            if (!disposed) emit();
          }
        }
      })();
      inFlight = request;
      emit();
      return request;
    },

    bindViewport(nextViewport) {
      if (disposed) return;
      if (viewport !== nextViewport && pendingAnchor != null) pendingAnchor = null;
      viewport = nextViewport;
    },

    onEntriesCommitted() {
      if (disposed || pendingAnchor == null || viewport == null) return false;
      const anchor = pendingAnchor;
      pendingAnchor = null;
      if (anchor.generation !== generation || anchor.pageGeneration !== pageGeneration) return false;
      if (!Number.isFinite(viewport.scrollHeight) || !Number.isFinite(viewport.scrollTop)) return false;
      viewport.scrollTop = anchor.scrollTop + (viewport.scrollHeight - anchor.scrollHeight);
      return true;
    },

    reset() {
      if (disposed) return;
      generation += 1;
      pageGeneration += 1;
      requestGeneration += 1;
      inFlight = null;
      clearPageState();
      emit();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      pageGeneration += 1;
      requestGeneration += 1;
      inFlight = null;
      clearPageState();
      viewport = null;
      listeners.clear();
    }
  };
}
