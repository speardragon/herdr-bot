// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=827526 (Dtt agent snapshot subscription)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=827686 (sJt all-automation subscription)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=828039 (iJt routine mutations)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5569299 (getAgentAutomations RPC table)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5570271 (runAgentAutomationNow RPC)

import type { RoutineAutomation, RoutinesController } from "./controller";
import { presentRoutineRunHistory, type RoutineRunHistoryPresentation, type RoutineRunPresentation } from "./run-history";

export interface RoutineRunHistoryScope {
  /** Stable pinnedAccountKey for signed-in sessions; null is the explicit logged-out scope. */
  readonly accountKey: string | null;
  readonly agentId: string;
  readonly automationId: string;
}

export interface RoutineRunHistoryClock {
  now(): number;
  timeZone?(): string | undefined;
  subscribe?(listener: () => void): () => void;
}

export type RoutineRunHistorySnapshot =
  | { readonly status: "unavailable"; readonly scope: null; readonly rows: readonly []; readonly pending: false; readonly error: null }
  | { readonly status: "loading"; readonly scope: RoutineRunHistoryScope; readonly rows: readonly RoutineRunPresentation[]; readonly pending: boolean; readonly error: null }
  | { readonly status: "empty"; readonly scope: RoutineRunHistoryScope; readonly rows: readonly []; readonly pending: boolean; readonly error: null }
  | { readonly status: "ready"; readonly scope: RoutineRunHistoryScope; readonly rows: readonly RoutineRunPresentation[]; readonly pending: boolean; readonly error: null }
  | { readonly status: "failed"; readonly scope: RoutineRunHistoryScope; readonly rows: readonly RoutineRunPresentation[]; readonly pending: boolean; readonly error: unknown };

const UNAVAILABLE_SNAPSHOT: RoutineRunHistorySnapshot = { status: "unavailable", scope: null, rows: [], pending: false, error: null };

export interface RoutineRunHistoryProvider {
  subscribe(listener: () => void): () => void;
  snapshot(): RoutineRunHistorySnapshot;
  setScope(scope: RoutineRunHistoryScope | null): void;
  refresh(): Promise<RoutineRunHistorySnapshot>;
  refreshOnReconnect(): Promise<RoutineRunHistorySnapshot>;
  runNow(): Promise<boolean>;
  dispose(): void;
}

/**
 * Typed boundary for the existing routines consumer. The clock is injected
 * by its owner; this provider never creates a timer or reads desktop state.
 */
export interface RoutineRunHistoryProviderOptions {
  readonly controller: RoutinesController;
  readonly clock?: RoutineRunHistoryClock;
  readonly initialScope?: RoutineRunHistoryScope | null;
}

const defaultClock: RoutineRunHistoryClock = { now: () => Date.now() };

function sameScope(left: RoutineRunHistoryScope | null, right: RoutineRunHistoryScope | null): boolean {
  return left?.accountKey === right?.accountKey && left?.agentId === right?.agentId && left?.automationId === right?.automationId;
}

/**
 * Account/agent/routine-scoped adapter over the exact shipped automations
 * owner. Runs are embedded in getAgentAutomations snapshots; this provider
 * intentionally has no invented history RPC, cursor, or pagination state.
 */
export function createRoutineRunHistoryProvider({
  controller,
  clock = defaultClock,
  initialScope = null
}: RoutineRunHistoryProviderOptions): RoutineRunHistoryProvider {
  let scope: RoutineRunHistoryScope | null = initialScope;
  let disposed = false;
  let generation = 0;
  let request = 0;
  let refreshing = false;
  const listeners = new Set<() => void>();
  let cachedSnapshot: RoutineRunHistorySnapshot | null = null;
  let cachedInputs: {
    scope: RoutineRunHistoryScope | null;
    automationSnapshot: ReturnType<RoutinesController["snapshot"]> | null;
    now: number | null;
    timeZone: string | undefined;
    pending: boolean;
    refreshing: boolean;
  } | null = null;
  let stopController: (() => void) | null = null;
  let stopClock: (() => void) | null = null;

  function startSources(): void {
    stopController ??= controller.subscribe(() => notify());
    stopClock ??= clock.subscribe?.(() => notify()) ?? null;
  }

  function stopSources(): void {
    stopController?.();
    stopController = null;
    stopClock?.();
    stopClock = null;
  }

  function notify(): void {
    if (!disposed) for (const listener of listeners) listener();
  }

  function selected(snapshot: ReturnType<RoutinesController["snapshot"]>): RoutineAutomation | null {
    if (scope == null) return null;
    return snapshot.value.find((automation) => automation.id === scope?.automationId) ?? null;
  }

  function currentSnapshot(): RoutineRunHistorySnapshot {
    if (disposed || scope == null) return UNAVAILABLE_SNAPSHOT;
    const currentScope = scope;
    const automationSnapshot = controller.snapshot(currentScope.agentId);
    const automation = selected(automationSnapshot);
    const now = clock.now();
    const timeZone = clock.timeZone?.();
    const pending = controller.runPending(currentScope.agentId, currentScope.automationId);
    if (cachedSnapshot != null && cachedInputs?.scope === currentScope && cachedInputs.automationSnapshot === automationSnapshot && cachedInputs.now === now && cachedInputs.timeZone === timeZone && cachedInputs.pending === pending && cachedInputs.refreshing === refreshing) return cachedSnapshot;
    const history: RoutineRunHistoryPresentation = presentRoutineRunHistory(
      automation?.runs ?? [],
      now,
      timeZone
    );
    const rows = history.rows;
    const next = refreshing || automationSnapshot.status === "loading"
      ? { status: "loading", scope: currentScope, rows, pending, error: null } as const
      : automationSnapshot.status === "failed"
        ? { status: "failed", scope: currentScope, rows, pending, error: automationSnapshot.error } as const
        : automation == null || history.empty
          ? { status: "empty", scope: currentScope, rows: [], pending, error: null } as const
          : { status: "ready", scope: currentScope, rows, pending, error: null } as const;
    cachedInputs = { scope: currentScope, automationSnapshot, now, timeZone, pending, refreshing };
    cachedSnapshot = next;
    return next;
  }

  async function refresh(): Promise<RoutineRunHistorySnapshot> {
    if (disposed || scope == null) return currentSnapshot();
    const currentGeneration = generation;
    const currentRequest = ++request;
    const agentId = scope.agentId;
    refreshing = true;
    notify();
    try {
      await controller.refresh(agentId);
      if (!disposed && currentGeneration === generation && currentRequest === request) {
        refreshing = false;
        notify();
      }
      return currentSnapshot();
    } catch (error) {
      if (disposed || currentGeneration !== generation || currentRequest !== request) return currentSnapshot();
      refreshing = false;
      notify();
      throw error;
    } finally {
      if (!disposed && currentGeneration === generation && currentRequest === request) {
        refreshing = false;
      }
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      if (disposed) return () => {};
      if (listeners.size === 0) startSources();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopSources();
      };
    },
    snapshot: currentSnapshot,
    setScope(next: RoutineRunHistoryScope | null): void {
      if (disposed || sameScope(scope, next)) return;
      const accountChanged = scope?.accountKey !== next?.accountKey;
      scope = next;
      generation += 1;
      request += 1;
      refreshing = false;
      if (accountChanged) controller.reset();
      notify();
    },
    refresh,
    refreshOnReconnect: refresh,
    async runNow(): Promise<boolean> {
      if (disposed || scope == null) return false;
      const currentGeneration = generation;
      const currentScope = scope;
      const automation = selected(controller.snapshot(currentScope.agentId));
      if (automation == null) return false;
      await controller.runNow(currentScope.agentId, automation.id);
      return !disposed && currentGeneration === generation;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      generation += 1;
      request += 1;
      refreshing = false;
      stopSources();
      listeners.clear();
    }
  };
}
