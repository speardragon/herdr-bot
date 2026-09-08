import type { RawPortCoordinatorSource } from "../../../runtime/coordinator-source";
import {
  createPluginAuthController,
  type PluginAuthController,
  type PluginAuthRosterAgent,
  type PluginAuthSnapshot,
  type PluginAuthSource,
} from "./github-auth";

export interface PluginAuthProductionScope {
  readonly accountKey: string | null;
  readonly agents: readonly PluginAuthRosterAgent[];
  readonly isRosterComplete: boolean;
}

export interface PluginAuthProductionAdapterOptions {
  readonly coordinator: Pick<RawPortCoordinatorSource, "getPluginSyncStatus" | "createAgent" | "sendPrompt">;
  selectAgent(agentId: string): void | Promise<unknown>;
}

export type PluginAuthProductionStatus = "signed-out" | "ready";

export interface PluginAuthProductionSnapshot {
  readonly accountKey: string | null;
  readonly status: PluginAuthProductionStatus;
  readonly generation: number;
  readonly controller: PluginAuthController | null;
  readonly plugin: PluginAuthSnapshot | null;
}

export interface PluginAuthProductionAdapter {
  getSnapshot(): PluginAuthProductionSnapshot;
  subscribe(listener: () => void): () => void;
  setScope(scope: PluginAuthProductionScope): void;
  refresh(): Promise<void>;
  reset(): void;
  dispose(): void;
}

function validScope(scope: PluginAuthProductionScope): boolean {
  return typeof scope.accountKey === "string" && scope.accountKey.length > 0;
}

export function createPluginAuthProductionAdapter(options: PluginAuthProductionAdapterOptions): PluginAuthProductionAdapter {
  let scope: PluginAuthProductionScope = { accountKey: null, agents: [], isRosterComplete: false };
  let generation = 0;
  let disposed = false;
  let controller: PluginAuthController | null = null;
  let unsubscribeController: (() => void) | null = null;
  const listeners = new Set<() => void>();
  let rosterSnapshot: { readonly agents: readonly PluginAuthRosterAgent[]; readonly isRosterComplete: boolean } = {
    agents: [],
    isRosterComplete: false,
  };
  let snapshot: PluginAuthProductionSnapshot = {
    accountKey: null,
    status: "signed-out",
    generation: 0,
    controller: null,
    plugin: null,
  };

  const refreshSnapshots = (): void => {
    if (rosterSnapshot.agents !== scope.agents || rosterSnapshot.isRosterComplete !== scope.isRosterComplete) {
      rosterSnapshot = { agents: scope.agents, isRosterComplete: scope.isRosterComplete };
    }
    snapshot = {
      accountKey: scope.accountKey,
      status: validScope(scope) ? "ready" : "signed-out",
      generation,
      controller,
      plugin: controller?.getSnapshot() ?? null,
    };
  };

  const emit = (): void => {
    if (disposed) return;
    refreshSnapshots();
    for (const listener of [...listeners]) listener();
  };
  const disposeController = (): void => {
    unsubscribeController?.();
    unsubscribeController = null;
    controller?.dispose();
    controller = null;
  };
  const rebuild = (next: PluginAuthProductionScope): void => {
    disposeController();
    generation += 1;
    scope = next;
    refreshSnapshots();
    if (validScope(next)) {
      const source: PluginAuthSource = {
        coordinator: options.coordinator,
        roster: {
          getSnapshot: () => rosterSnapshot,
          selectAgent: (agentId) => { void options.selectAgent(agentId); },
        },
      };
      controller = createPluginAuthController(source);
      unsubscribeController = controller.subscribe(emit);
    }
    emit();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(next) {
      if (disposed) return;
      if (scope.accountKey !== next.accountKey) {
        rebuild(next);
        return;
      }
      scope = next;
      emit();
    },
    refresh: async () => {
      if (controller == null) return;
      await controller.refresh();
    },
    reset() {
      if (disposed) return;
      rebuild({ accountKey: null, agents: [], isRosterComplete: false });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      disposeController();
      refreshSnapshots();
      listeners.clear();
    },
  };
}
