// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5080561 (thread summary copy and callback)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5080586 (sand-thread-affordance selector)

export interface TranscriptThreadSummary {
  readonly rootId: string;
  readonly count: number;
}

/** Structural page shape supplied by the forthcoming transcript-window owner. */
export interface TranscriptThreadCountsPage {
  readonly threadCounts: Readonly<Record<string, number>>;
}

/**
 * Projects the exact root/count map onto entries present in the current
 * transcript window. Unknown roots and malformed counts stay fail-closed;
 * pagination callers can feed the result into the existing merge methods.
 */
export function projectThreadCounts(
  page: TranscriptThreadCountsPage,
  entryIds: readonly string[],
): readonly TranscriptThreadSummary[] {
  const summaries: TranscriptThreadSummary[] = [];
  for (const rootId of entryIds) {
    const count = page.threadCounts[rootId];
    if (!rootId || !Number.isInteger(count) || count <= 0) continue;
    summaries.push({ rootId, count });
  }
  return summaries;
}

export interface TranscriptThreadSummaryScope {
  readonly accountSlot: string | null;
  readonly agentId: string | null;
}

export interface ThreadSummaryNavigation {
  readonly targetId: string;
  readonly isInScope: boolean;
  readonly status: "resolved" | "missing";
  readonly generation: number;
}

export interface ThreadSummaryControllerOptions {
  readonly scope?: TranscriptThreadSummaryScope;
  readonly onScrollToEntry?: (targetId: string) => void;
  readonly onOpenThread?: (targetId: string) => void;
  readonly onRestoreFocus?: () => void;
}

export interface ThreadSummaryController {
  getScope(): TranscriptThreadSummaryScope;
  getGeneration(): number;
  getThreadSummary(entryId: string): TranscriptThreadSummary | null;
  replaceSummaries(summaries: readonly TranscriptThreadSummary[]): void;
  prependSummaries(summaries: readonly TranscriptThreadSummary[]): void;
  appendSummaries(summaries: readonly TranscriptThreadSummary[]): void;
  replaceEntryIds(entryIds: readonly string[]): void;
  prependEntryIds(entryIds: readonly string[]): void;
  appendEntryIds(entryIds: readonly string[]): void;
  navigate(targetId: string): ThreadSummaryNavigation;
  setScope(scope: TranscriptThreadSummaryScope): void;
  dispose(): void;
}

function cloneScope(scope: TranscriptThreadSummaryScope): TranscriptThreadSummaryScope {
  return { accountSlot: scope.accountSlot, agentId: scope.agentId };
}

function sameScope(left: TranscriptThreadSummaryScope, right: TranscriptThreadSummaryScope): boolean {
  return left.accountSlot === right.accountSlot && left.agentId === right.agentId;
}

function validSummary(value: TranscriptThreadSummary): boolean {
  return value.rootId.length > 0 && Number.isInteger(value.count) && value.count > 0;
}

function indexSummaries(values: readonly TranscriptThreadSummary[]): Map<string, TranscriptThreadSummary> {
  const indexed = new Map<string, TranscriptThreadSummary>();
  for (const value of values) {
    if (!validSummary(value)) continue;
    indexed.set(value.rootId, { rootId: value.rootId, count: value.count });
  }
  return indexed;
}

function mergeIds(current: Set<string>, incoming: readonly string[], prepend: boolean): Set<string> {
  const next = new Set<string>();
  if (prepend) for (const id of incoming) if (id.length > 0) next.add(id);
  for (const id of current) next.add(id);
  if (!prepend) for (const id of incoming) if (id.length > 0) next.add(id);
  return next;
}

export function createThreadSummaryController(options: ThreadSummaryControllerOptions = {}): ThreadSummaryController {
  let scope = cloneScope(options.scope ?? { accountSlot: null, agentId: null });
  let generation = 0;
  let summaries = new Map<string, TranscriptThreadSummary>();
  let entryIds = new Set<string>();
  let disposed = false;

  const replaceSummaries = (nextSummaries: readonly TranscriptThreadSummary[]) => {
    if (disposed) return;
    summaries = indexSummaries(nextSummaries);
  };
  const mergeSummaries = (nextSummaries: readonly TranscriptThreadSummary[], prepend: boolean) => {
    if (disposed) return;
    const incoming = indexSummaries(nextSummaries);
    const merged = new Map<string, TranscriptThreadSummary>();
    if (prepend) for (const [id, summary] of incoming) merged.set(id, summary);
    for (const [id, summary] of summaries) merged.set(id, summary);
    if (!prepend) for (const [id, summary] of incoming) merged.set(id, summary);
    summaries = merged;
  };
  const replaceEntryIds = (nextEntryIds: readonly string[]) => {
    if (disposed) return;
    entryIds = new Set(nextEntryIds.filter((id) => id.length > 0));
  };
  const mergeEntryIds = (nextEntryIds: readonly string[], prepend: boolean) => {
    if (disposed) return;
    entryIds = mergeIds(entryIds, nextEntryIds, prepend);
  };

  return {
    getScope: () => cloneScope(scope),
    getGeneration: () => generation,
    getThreadSummary(entryId) {
      if (disposed || entryId.length === 0) return null;
      return summaries.get(entryId) ?? null;
    },
    replaceSummaries,
    prependSummaries: (nextSummaries) => mergeSummaries(nextSummaries, true),
    appendSummaries: (nextSummaries) => mergeSummaries(nextSummaries, false),
    replaceEntryIds,
    prependEntryIds: (nextEntryIds) => mergeEntryIds(nextEntryIds, true),
    appendEntryIds: (nextEntryIds) => mergeEntryIds(nextEntryIds, false),
    navigate(targetId) {
      const navigation: ThreadSummaryNavigation = {
        targetId,
        isInScope: !disposed && targetId.length > 0 && entryIds.has(targetId),
        status: !disposed && targetId.length > 0 && (entryIds.has(targetId) || summaries.has(targetId)) ? "resolved" : "missing",
        generation,
      };
      if (navigation.status === "missing") return navigation;
      if (navigation.isInScope) options.onScrollToEntry?.(targetId);
      else options.onOpenThread?.(targetId);
      options.onRestoreFocus?.();
      return navigation;
    },
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      scope = cloneScope(nextScope);
      generation += 1;
      summaries = new Map();
      entryIds = new Set();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      summaries = new Map();
      entryIds = new Set();
    },
  };
}
