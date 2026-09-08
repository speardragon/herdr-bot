/**
 * The Hidden Chats actions are the roster controller's optimistic hidden-row
 * mutations, kept separate from the root's authoritative agent projection.
 *
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5657213
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5659740
 */

export interface HiddenChatsMutationAgent {
  readonly id: string;
  readonly isHidden: boolean;
  readonly updatedAt: number;
}

export interface HiddenChatsMutationController {
  setScope(accountSlot: string | null, activeAgentId: string | null): void;
  ingestAgents(agents: readonly HiddenChatsMutationAgent[]): void;
  setAgentHiddenFromSidebar(agentId: string, isHidden: boolean): Promise<void>;
  noteReconnect(): void;
  isPending(agentId: string): boolean;
  reset(): void;
  dispose(): void;
}

export interface HiddenChatsMutationControllerOptions {
  call(input: { id: string; isHidden: boolean }): Promise<unknown>;
  readAgent(agentId: string): HiddenChatsMutationAgent | null;
  onOptimisticChange(agentId: string, isHidden: boolean): void;
  onRollback(agentId: string, optimisticValue: boolean, previousValue: boolean): void;
}

interface MutationRecord {
  readonly id: string;
  readonly value: boolean;
  readonly previousValue: boolean;
  readonly atRowUpdatedAt: number;
  inFlight: number;
  confirmed: boolean | null;
}

interface HeldMutation {
  readonly id: string;
  readonly value: boolean;
}

function isTransportFailure(reason: unknown): boolean {
  if (typeof reason !== "object" || reason == null) return false;
  const record = reason as Record<string, unknown>;
  return record.code === "source/transport-failure" || typeof record.transportKind === "string";
}

export function createHiddenChatsMutationController(
  options: HiddenChatsMutationControllerOptions
): HiddenChatsMutationController {
  const mutations = new Map<string, MutationRecord>();
  const held = new Map<string, HeldMutation>();
  let accountSlot: string | null = null;
  let activeAgentId: string | null = null;
  let generation = 0;
  let disposed = false;

  const isCurrent = (expectedGeneration: number): boolean => !disposed && expectedGeneration === generation;

  const finish = (agentId: string, expectedGeneration: number, outcome: "confirm" | "rollback"): void => {
    if (!isCurrent(expectedGeneration)) return;
    const mutation = mutations.get(agentId);
    if (mutation == null) return;
    if (mutation.inFlight > 1) {
      mutation.inFlight -= 1;
      return;
    }
    if (outcome === "rollback") {
      mutations.delete(agentId);
      held.delete(agentId);
      options.onRollback(agentId, mutation.value, mutation.previousValue);
      return;
    }
    mutation.inFlight = 0;
    mutation.confirmed = mutation.value;
  };

  const run = async (mutation: MutationRecord, expectedGeneration: number): Promise<void> => {
    try {
      await options.call({ id: mutation.id, isHidden: mutation.value });
    } catch (reason) {
      if (!isCurrent(expectedGeneration)) return;
      if (isTransportFailure(reason)) {
        finish(mutation.id, expectedGeneration, "confirm");
        held.set(mutation.id, { id: mutation.id, value: mutation.value });
      } else {
        finish(mutation.id, expectedGeneration, "rollback");
      }
      throw reason;
    }
    if (!isCurrent(expectedGeneration)) return;
    finish(mutation.id, expectedGeneration, "confirm");
    held.delete(mutation.id);
  };

  const retryHeld = (): void => {
    if (disposed) return;
    const expectedGeneration = generation;
    for (const heldMutation of [...held.values()]) {
      const current = mutations.get(heldMutation.id);
      if (current == null || current.inFlight > 0) continue;
      const retry: MutationRecord = {
        ...current,
        inFlight: 1,
        value: heldMutation.value
      };
      mutations.set(retry.id, retry);
      void run(retry, expectedGeneration).catch(() => {});
    }
  };

  return {
    setScope(nextAccountSlot, nextActiveAgentId) {
      if (disposed || (accountSlot === nextAccountSlot && activeAgentId === nextActiveAgentId)) return;
      generation += 1;
      accountSlot = nextAccountSlot;
      activeAgentId = nextActiveAgentId;
      mutations.clear();
      held.clear();
    },
    ingestAgents(agents) {
      if (disposed) return;
      const current = new Map(agents.map((agent) => [agent.id, agent]));
      for (const [agentId, mutation] of mutations) {
        if (mutation.inFlight > 0 || mutation.confirmed == null) continue;
        const agent = current.get(agentId);
        if (agent == null) continue;
        if (agent.isHidden === mutation.confirmed) {
          mutations.delete(agentId);
          held.delete(agentId);
        }
      }
    },
    async setAgentHiddenFromSidebar(agentId, isHidden) {
      if (disposed || accountSlot == null || agentId.length === 0) return;
      const current = options.readAgent(agentId);
      if (current == null) return;
      const existing = mutations.get(agentId);
      if ((existing != null && existing.inFlight > 0) || held.has(agentId)) return;
      const expectedGeneration = generation;
      const mutation: MutationRecord = {
        id: agentId,
        value: isHidden,
        previousValue: current.isHidden,
        atRowUpdatedAt: current.updatedAt,
        inFlight: 1,
        confirmed: null
      };
      mutations.set(agentId, mutation);
      options.onOptimisticChange(agentId, isHidden);
      return run(mutation, expectedGeneration);
    },
    noteReconnect() {
      retryHeld();
    },
    isPending(agentId) {
      const mutation = mutations.get(agentId);
      return !disposed && ((mutation != null && mutation.inFlight > 0) || held.has(agentId));
    },
    reset() {
      generation += 1;
      accountSlot = null;
      activeAgentId = null;
      mutations.clear();
      held.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      accountSlot = null;
      activeAgentId = null;
      mutations.clear();
      held.clear();
    }
  };
}
