import type { ProductionCoordinatorClient } from "./coordinator-client";
import { createAppAlertController, type AppAlertController } from "../recovered/features/window-chrome/app-alert/controller";
import {
  createGenerationFencedGroupRosterSource,
  type GenerationFencedGroupRosterSource,
} from "../recovered/features/agent-info/group-members/bridge";
import {
  createGroupMembersProvider,
  type GroupMembersProvider,
} from "../recovered/features/agent-info/group-members/model";

export interface SynchronizedRendererRosterOwner {
  getAgents(): readonly unknown[];
  getAccountGeneration(): number;
  subscribe(listener: () => void): () => void;
  setAgents(agents: readonly unknown[]): void;
  reset(): void;
  dispose(): void;
}

export interface GroupMembersRootScope {
  readonly alert: AppAlertController;
  readonly roster: SynchronizedRendererRosterOwner;
  readonly source: GenerationFencedGroupRosterSource;
  readonly provider: GroupMembersProvider;
  reset(): void;
  dispose(): void;
}

function createSynchronizedRendererRosterOwner(): SynchronizedRendererRosterOwner {
  let agents: readonly unknown[] = [];
  let accountGeneration = 0;
  let disposed = false;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };

  return {
    getAgents: () => agents,
    getAccountGeneration: () => accountGeneration,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAgents(next) {
      if (disposed) return;
      agents = next;
      notify();
    },
    reset() {
      if (disposed) return;
      accountGeneration += 1;
      agents = [];
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      agents = [];
      listeners.clear();
    },
  };
}

export function createGroupMembersRootScope(
  client: Pick<ProductionCoordinatorClient, "call"> | null,
): GroupMembersRootScope {
  const alert = createAppAlertController();
  const roster = createSynchronizedRendererRosterOwner();
  const source = createGenerationFencedGroupRosterSource(roster, client ?? {
    call: async () => {
      throw new Error("coordinator is unavailable for setGroupMembers");
    },
  });
  const provider = createGroupMembersProvider(source, alert);
  let disposed = false;

  return {
    alert,
    roster,
    source,
    provider,
    reset() {
      if (disposed) return;
      source.reset();
      roster.reset();
      provider.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      provider.dispose();
      source.dispose();
      roster.dispose();
      alert.dispose();
    },
  };
}
