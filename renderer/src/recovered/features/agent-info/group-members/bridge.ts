import type { ProductionCoordinatorClient } from "../../../../production/coordinator-client";
import type { GroupRosterSource, GroupRosterSourceSnapshot } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2731003 (shipped group member action calls setGroupMembers; UTF-8 offset; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/host/host-main.cjs#byteOffset=17926213 (shipped host dispatches setGroupMembers through the RPC gateway; UTF-8 offset; SHA256 b0e529081dd0f7fe4b162eebdf8f796aff99b287cc47ee3e48a1c86c332025cc)

export interface SetGroupMembersArgs {
  readonly id: string;
  readonly memberAgentIds: readonly string[];
}

export type SetGroupMembersReply = Record<string, unknown> | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSetGroupMembersArgs(value: SetGroupMembersArgs): boolean {
  return value.id.length > 0 && value.memberAgentIds.every((id) => id.length > 0);
}

/** Typed production boundary for the already-shipped setGroupMembers RPC. */
export async function typedCoordinatorSetGroupMembers(
  client: Pick<ProductionCoordinatorClient, "call">,
  args: SetGroupMembersArgs
): Promise<SetGroupMembersReply> {
  if (!isSetGroupMembersArgs(args)) throw new TypeError("setGroupMembers requires non-empty agent ids");
  const reply = await client.call("setGroupMembers", { id: args.id, memberAgentIds: [...args.memberAgentIds] });
  if (reply === null || isRecord(reply)) return reply;
  throw new TypeError("setGroupMembers returned a malformed record reply");
}

export interface SynchronizedRosterOwner {
  getAgents(): readonly unknown[];
  getAccountGeneration(): number;
  subscribe(listener: () => void): () => void;
}

export interface GenerationFencedGroupRosterSource extends GroupRosterSource {
  reset(): void;
  dispose(): void;
}

/**
 * Adapts the root's synchronized roster state without owning a second roster.
 * Notifications and RPC completions from a previous source generation are
 * ignored after reset or disposal.
 */
export function createGenerationFencedGroupRosterSource(
  owner: SynchronizedRosterOwner,
  client: Pick<ProductionCoordinatorClient, "call">
): GenerationFencedGroupRosterSource {
  let lifecycleGeneration = 0;
  let disposed = false;
  const cleanups = new Set<() => void>();

  const getSnapshot = (): GroupRosterSourceSnapshot => ({
    accountGeneration: owner.getAccountGeneration(),
    agents: owner.getAgents()
  });

  return {
    getSnapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      const generation = lifecycleGeneration;
      const unsubscribe = owner.subscribe(() => {
        if (!disposed && lifecycleGeneration === generation) listener();
      });
      cleanups.add(unsubscribe);
      return () => {
        cleanups.delete(unsubscribe);
        unsubscribe();
      };
    },
    async setGroupMembers(args) {
      if (disposed) return null;
      const generation = lifecycleGeneration;
      try {
        const reply = await typedCoordinatorSetGroupMembers(client, args);
        return disposed || lifecycleGeneration !== generation ? null : reply;
      } catch (error: unknown) {
        if (disposed || lifecycleGeneration !== generation) return null;
        throw error;
      }
    },
    reset() {
      if (disposed) return;
      lifecycleGeneration += 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycleGeneration += 1;
      for (const cleanup of [...cleanups]) cleanup();
      cleanups.clear();
    }
  };
}
