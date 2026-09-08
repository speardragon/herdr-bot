import type { ConversationTranscriptEntry } from "../../workspace/model";

/**
 * Structural boundary for the forthcoming thread transport. The host contract
 * is intentionally kept out of this leaf until its coordinator/preload owner
 * is released; the request and reply shapes are the only transport facts this
 * consumer relies on.
 */
export interface ThreadLoaderSource {
  getAgentThread(request: { readonly id: string; readonly rootId: string }): Promise<ThreadPage>;
}

export interface ThreadPage {
  readonly entries: readonly ConversationTranscriptEntry[];
}

export interface ThreadLoaderScope {
  readonly accountSlot: string | null;
  readonly agentId: string | null;
}

export type ThreadLoaderStatus = "idle" | "unavailable" | "loading" | "ready" | "empty" | "failed";

export interface ThreadLoaderSnapshot {
  readonly status: ThreadLoaderStatus;
  readonly scope: ThreadLoaderScope;
  readonly targetId: string | null;
  readonly entries: readonly ConversationTranscriptEntry[];
  readonly generation: number;
  readonly error?: unknown;
}

export interface ThreadLoaderOptions {
  readonly source: ThreadLoaderSource;
  readonly scope?: ThreadLoaderScope;
}

export interface ThreadLoader {
  getScope(): ThreadLoaderScope;
  getGeneration(): number;
  getSnapshot(): ThreadLoaderSnapshot;
  subscribe(listener: () => void): () => void;
  load(rootId: string): Promise<ThreadLoaderSnapshot | null>;
  setScope(scope: ThreadLoaderScope): void;
  reset(): void;
  dispose(): void;
}

const EMPTY_ENTRIES: readonly ConversationTranscriptEntry[] = [];

function cloneScope(scope: ThreadLoaderScope): ThreadLoaderScope {
  return { accountSlot: scope.accountSlot, agentId: scope.agentId };
}

function sameScope(left: ThreadLoaderScope, right: ThreadLoaderScope): boolean {
  return left.accountSlot === right.accountSlot && left.agentId === right.agentId;
}

function canLoad(scope: ThreadLoaderScope, rootId: string): boolean {
  return scope.accountSlot != null && scope.agentId != null && rootId.length > 0;
}

function snapshot(
  status: ThreadLoaderStatus,
  scope: ThreadLoaderScope,
  generation: number,
  targetId: string | null = null,
  entries: readonly ConversationTranscriptEntry[] = EMPTY_ENTRIES,
  error?: unknown,
): ThreadLoaderSnapshot {
  return error === undefined
    ? { status, scope: cloneScope(scope), targetId, entries, generation }
    : { status, scope: cloneScope(scope), targetId, entries, generation, error };
}

export function createThreadLoader(options: ThreadLoaderOptions): ThreadLoader {
  let scope = cloneScope(options.scope ?? { accountSlot: null, agentId: null });
  let generation = 0;
  let current = snapshot("idle", scope, generation);
  let disposed = false;
  let pendingRootId: string | null = null;
  let pending: Promise<ThreadLoaderSnapshot | null> | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: ThreadLoaderSnapshot) => {
    if (disposed) return;
    current = next;
    for (const listener of listeners) listener();
  };

  const resetSnapshot = (status: ThreadLoaderStatus = "idle") => {
    publish(snapshot(status, scope, generation));
  };

  return {
    getScope: () => cloneScope(scope),
    getGeneration: () => generation,
    getSnapshot: () => current,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load(rootId) {
      if (disposed) return Promise.resolve(null);
      if (!canLoad(scope, rootId)) {
        resetSnapshot("unavailable");
        return Promise.resolve(current);
      }
      if (pending != null && pendingRootId === rootId) return pending;

      generation += 1;
      const requestGeneration = generation;
      pendingRootId = rootId;
      publish(snapshot("loading", scope, requestGeneration, rootId));
      pending = options.source.getAgentThread({ id: scope.agentId!, rootId }).then(
        (page) => {
          if (disposed || requestGeneration !== generation || scope.agentId == null || pendingRootId !== rootId) return null;
          const entries = page.entries;
          const next = snapshot(entries.length === 0 ? "empty" : "ready", scope, requestGeneration, rootId, entries);
          publish(next);
          return next;
        },
        (error: unknown) => {
          if (disposed || requestGeneration !== generation || scope.agentId == null || pendingRootId !== rootId) return null;
          const next = snapshot("failed", scope, requestGeneration, rootId, EMPTY_ENTRIES, error);
          publish(next);
          return next;
        },
      ).finally(() => {
        if (requestGeneration === generation && pendingRootId === rootId) {
          pending = null;
          pendingRootId = null;
        }
      });
      return pending;
    },
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      generation += 1;
      pending = null;
      pendingRootId = null;
      scope = cloneScope(nextScope);
      resetSnapshot("idle");
    },
    reset() {
      if (disposed) return;
      generation += 1;
      pending = null;
      pendingRootId = null;
      resetSnapshot("idle");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      pending = null;
      pendingRootId = null;
      listeners.clear();
    },
  };
}
