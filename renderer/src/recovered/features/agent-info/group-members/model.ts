import type { AppAlertController, AppAlertRequest } from "../../window-chrome/app-alert/controller";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2291345 (non-shared group gate)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2723358 (F2n removal request)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2723963 (z2n member pane)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3473318 (Windows F2n)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3474035 (Windows z2n)

export const GROUP_MAX_MEMBERS = 6;

export interface GroupMemberAgent {
  readonly id: string;
  readonly name: string;
  readonly isGroup: boolean;
  readonly memberIds: readonly string[];
  readonly isSharedRoom?: boolean;
}

export interface GroupRosterSourceSnapshot {
  readonly accountGeneration: number;
  readonly agents: readonly unknown[];
}

export interface GroupRosterSource {
  getSnapshot(): GroupRosterSourceSnapshot;
  subscribe(listener: () => void): () => void;
  setGroupMembers(args: { readonly id: string; readonly memberAgentIds: readonly string[] }): Promise<unknown>;
}

export type GroupMembersPending =
  | { readonly kind: "add" | "remove"; readonly agentId: string; readonly generation: number }
  | null;

export interface GroupMembersSnapshot {
  readonly group: GroupMemberAgent | null;
  readonly members: readonly GroupMemberAgent[];
  readonly candidates: readonly GroupMemberAgent[];
  readonly canAdd: boolean;
  readonly canRemove: boolean;
  readonly pending: GroupMembersPending;
  readonly failure: unknown | null;
  readonly accountGeneration: number;
}

export interface GroupMembersProvider {
  getSnapshot(): GroupMembersSnapshot;
  subscribe(listener: () => void): () => void;
  setContext(agent: GroupMemberAgent | null, accountGeneration: number): void;
  addMember(agentId: string): Promise<boolean>;
  requestRemoveMember(agent: Pick<GroupMemberAgent, "id" | "name">): Promise<boolean>;
  reset(): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

/** Strictly projects roster rows; malformed or partial rows never enter the pane. */
export function projectGroupMemberAgent(value: unknown): GroupMemberAgent | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || typeof value.name !== "string" || typeof value.isGroup !== "boolean" || !stringArray(value.memberIds)) return null;
  if (value.isSharedRoom !== undefined && typeof value.isSharedRoom !== "boolean") return null;
  return {
    id: value.id,
    name: value.name,
    isGroup: value.isGroup,
    memberIds: [...value.memberIds],
    ...(value.isSharedRoom === undefined ? {} : { isSharedRoom: value.isSharedRoom })
  };
}

const EMPTY_SNAPSHOT: GroupMembersSnapshot = {
  group: null,
  members: [],
  candidates: [],
  canAdd: false,
  canRemove: false,
  pending: null,
  failure: null,
  accountGeneration: -1
};

function removalRequest(
  name: string,
  removeMember: () => Promise<void>
): AppAlertRequest {
  return {
    title: `Remove ${name} from this conversation?`,
    description: "",
    confirmLabel: "Remove",
    pendingLabel: "Removing...",
    cancelLabel: "Cancel",
    destructive: true,
    perform: async () => {
      try {
        await removeMember();
        return null;
      } catch {
        return "Removing failed. Check your connection and try again.";
      }
    }
  };
}

function sameAgent(left: GroupMemberAgent | null, right: GroupMemberAgent | null): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return left.id === right.id && left.name === right.name && left.isGroup === right.isGroup
    && left.isSharedRoom === right.isSharedRoom && left.memberIds.length === right.memberIds.length
    && left.memberIds.every((id, index) => id === right.memberIds[index]);
}

export function createGroupMembersProvider(
  source: GroupRosterSource,
  alert: Pick<AppAlertController, "alert" | "reset">
): GroupMembersProvider {
  let contextAgent: GroupMemberAgent | null = null;
  let contextGeneration = -1;
  let pending: GroupMembersPending = null;
  let failure: unknown | null = null;
  let disposed = false;
  let actionGeneration = 0;
  const listeners = new Set<() => void>();
  let snapshot = EMPTY_SNAPSHOT;

  const emit = (): void => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };

  const derive = (): GroupMembersSnapshot => {
    const sourceSnapshot = source.getSnapshot();
    const roster = sourceSnapshot.agents.flatMap((value) => {
      const agent = projectGroupMemberAgent(value);
      return agent == null ? [] : [agent];
    });
    const context = contextAgent;
    const group = context == null || !context.isGroup || context.isSharedRoom === true
      ? null
      : roster.find((agent) => agent.id === context.id) ?? context;
    if (group == null || sourceSnapshot.accountGeneration !== contextGeneration) {
      return { ...EMPTY_SNAPSHOT, accountGeneration: sourceSnapshot.accountGeneration, pending, failure };
    }
    const byId = new Map(roster.map((agent) => [agent.id, agent]));
    const members = group.memberIds.flatMap((id) => {
      const agent = byId.get(id);
      return agent == null ? [] : [agent];
    });
    const memberIds = new Set(group.memberIds);
    const candidates = roster.filter((agent) => !agent.isGroup && agent.id !== group.id && !memberIds.has(agent.id));
    return {
      group,
      members,
      candidates,
      canAdd: group.memberIds.length < GROUP_MAX_MEMBERS && candidates.length > 0,
      canRemove: group.memberIds.length > 1 && pending == null,
      pending,
      failure,
      accountGeneration: sourceSnapshot.accountGeneration
    };
  };

  const publish = (): void => {
    snapshot = derive();
    emit();
  };

  const currentContext = (generation: number): GroupMemberAgent | null => {
    if (disposed || generation !== actionGeneration) return null;
    const sourceSnapshot = source.getSnapshot();
    if (sourceSnapshot.accountGeneration !== contextGeneration) return null;
    const rows = sourceSnapshot.agents.flatMap((value) => {
      const agent = projectGroupMemberAgent(value);
      return agent == null ? [] : [agent];
    });
    const group = rows.find((agent) => agent.id === contextAgent?.id) ?? null;
    return group?.isGroup === true && group.isSharedRoom !== true ? group : null;
  };

  const subscription = source.subscribe(publish);

  const runMutation = async (
    kind: "add" | "remove",
    groupId: string,
    agentId: string,
    memberIds: readonly string[],
    generation: number,
    rethrow: boolean
  ): Promise<boolean> => {
    pending = { kind, agentId, generation };
    failure = null;
    publish();
    try {
      await source.setGroupMembers({ id: groupId, memberAgentIds: memberIds });
      return true;
    } catch (error: unknown) {
      if (generation === actionGeneration && generation === contextGeneration && !disposed) {
        failure = error;
        publish();
      }
      if (rethrow) throw error;
      return false;
    } finally {
      if (generation === actionGeneration && !disposed) {
        pending = null;
        publish();
      }
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setContext(agent, accountGeneration) {
      if (disposed) return;
      const changed = !sameAgent(contextAgent, agent) || contextGeneration !== accountGeneration;
      contextAgent = agent;
      contextGeneration = accountGeneration;
      if (!changed) {
        publish();
        return;
      }
      actionGeneration += 1;
      pending = null;
      failure = null;
      alert.reset();
      publish();
    },
    async addMember(agentId) {
      const generation = actionGeneration;
      const group = currentContext(generation);
      if (group == null || pending != null || group.memberIds.length >= GROUP_MAX_MEMBERS) return false;
      const sourceSnapshot = source.getSnapshot();
      const candidate = sourceSnapshot.agents.flatMap((value) => {
        const agent = projectGroupMemberAgent(value);
        return agent == null ? [] : [agent];
      }).find((agent) => agent.id === agentId);
      if (candidate == null || candidate.isGroup || candidate.id === group.id || group.memberIds.includes(candidate.id)) return false;
      return runMutation("add", group.id, candidate.id, [...group.memberIds, candidate.id], generation, false);
    },
    async requestRemoveMember(agent) {
      const generation = actionGeneration;
      const group = currentContext(generation);
      if (group == null || pending != null || group.memberIds.length <= 1 || !group.memberIds.includes(agent.id)) return false;
      const result = await alert.alert(removalRequest(agent.name, async () => {
        const latest = currentContext(generation);
        if (latest == null || latest.memberIds.length <= 1 || !latest.memberIds.includes(agent.id)) return;
        const memberIds = latest.memberIds.filter((id) => id !== agent.id);
        await runMutation("remove", latest.id, agent.id, memberIds, generation, true);
      }));
      return result;
    },
    reset() {
      if (disposed) return;
      actionGeneration += 1;
      contextAgent = null;
      contextGeneration = -1;
      pending = null;
      failure = null;
      alert.reset();
      publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      actionGeneration += 1;
      pending = null;
      contextAgent = null;
      contextGeneration = -1;
      subscription();
      alert.reset();
      listeners.clear();
    }
  };
}
