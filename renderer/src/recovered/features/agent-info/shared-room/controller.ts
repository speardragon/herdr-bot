import type { ProductionCoordinatorClient } from "../../../../production/coordinator-client";
import {
  projectSharingState,
  type SharedInviteResult,
  type SharedRoom,
  type SharedRoomAction,
  type SharedRoomAgent,
  type SharedRoomContext,
  type SharedRoomSnapshot,
  type SharedSharingState
} from "./model";
import {
  typedAddOwnAgentToSharedRoom,
  typedCreateRoomInvite,
  typedGetSharingState,
  typedLeaveSharedRoom,
  typedRemoveOwnAgentFromSharedRoom,
  typedRespondToRoomJoinRequest
} from "./bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5690959 (sharing state RPC projection; UTF-8; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=7153664 (sharing state RPC projection; UTF-8; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

export interface SharedRoomProvider {
  readonly getSnapshot: () => SharedRoomSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setContext: (context: SharedRoomContext | null) => void;
  readonly refresh: () => Promise<boolean>;
  readonly createRoomInvite: () => Promise<SharedInviteResult | null>;
  readonly respondToRoomJoinRequest: (requestId: string, isApproved: boolean) => Promise<boolean>;
  readonly addOwnAgent: (agent: Pick<SharedRoomAgent, "id" | "name">) => Promise<boolean>;
  readonly removeOwnAgent: (agentId: string) => Promise<boolean>;
  readonly leaveSharedRoom: (targetAuthId?: string) => Promise<boolean>;
  readonly reset: () => void;
  readonly dispose: () => void;
}

const EMPTY_SNAPSHOT: SharedRoomSnapshot = {
  context: null,
  state: null,
  room: null,
  isHost: false,
  selfAgentIds: [],
  candidates: [],
  requests: [],
  pending: new Set(),
  pendingAction: null,
  invite: null,
  isLoading: false,
  transport: "unknown",
  failure: null
};

function sameContext(left: SharedRoomContext | null, right: SharedRoomContext | null): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return left.roomId === right.roomId && left.agentId === right.agentId && left.accountGeneration === right.accountGeneration && left.agents.length === right.agents.length && left.agents.every((agent, index) => agent.id === right.agents[index]?.id && agent.name === right.agents[index]?.name && agent.isGroup === right.agents[index]?.isGroup);
}

function derive(context: SharedRoomContext | null, state: SharedSharingState | null, pending: ReadonlySet<string>, pendingAction: SharedRoomAction | null, invite: SharedInviteResult | null, isLoading: boolean, transport: "connected" | "down" | "unknown", failure: unknown | null): SharedRoomSnapshot {
  const room = context == null || state == null ? null : state.rooms.find((candidate) => candidate.roomId === context.roomId) ?? null;
  const isHost = room != null && state?.selfAuthId != null && room.hostAuthId === state.selfAuthId;
  const selfAgentIds = room == null || state?.selfAuthId == null ? [] : room.members.filter((member) => member.kind === "agent" && member.authId === state.selfAuthId && member.agentId != null).map((member) => member.agentId as string);
  const memberIds = new Set(room?.members.filter((member) => member.kind === "agent" && member.authId === state?.selfAuthId && member.agentId != null).map((member) => member.agentId as string));
  const candidates = context == null ? [] : context.agents.filter((agent) => !agent.isGroup && agent.remoteRoom == null && agent.isSharedRoom !== true);
  return {
    context,
    state,
    room,
    isHost,
    selfAgentIds,
    candidates,
    requests: context == null || state == null ? [] : state.pendingJoinRequests.filter((request) => request.roomId === context.roomId),
    pending,
    pendingAction,
    invite,
    isLoading,
    transport,
    failure
  };
}

export function createSharedRoomProvider(client: ProductionCoordinatorClient): SharedRoomProvider {
  const listeners = new Set<() => void>();
  let context: SharedRoomContext | null = null;
  let state: SharedSharingState | null = null;
  let pending = new Set<string>();
  let pendingAction: SharedRoomAction | null = null;
  let invite: SharedInviteResult | null = null;
  let isLoading = false;
  let transport: "connected" | "down" | "unknown" = "unknown";
  let failure: unknown | null = null;
  let lifecycleGeneration = 0;
  let requestGeneration = 0;
  let disposed = false;
  let snapshot = EMPTY_SNAPSHOT;

  const emit = (): void => {
    if (disposed) return;
    snapshot = derive(context, state, pending, pendingAction, invite, isLoading, transport, failure);
    for (const listener of [...listeners]) listener();
  };
  const current = (generation: number): boolean => !disposed && generation === lifecycleGeneration;
  const clearTransient = (): void => {
    pending = new Set();
    pendingAction = null;
    invite = null;
    isLoading = false;
    failure = null;
  };
  const applyState = (next: SharedSharingState, generation: number): boolean => {
    if (!current(generation)) return false;
    state = next;
    failure = null;
    emit();
    return true;
  };
  const refresh = async (): Promise<boolean> => {
    if (disposed || context == null || transport === "down") return false;
    const generation = lifecycleGeneration;
    isLoading = true;
    failure = null;
    emit();
    try {
      const next = await typedGetSharingState(client);
      if (!current(generation)) return false;
      state = next;
      return true;
    } catch (error: unknown) {
      if (current(generation)) failure = error;
      return false;
    } finally {
      if (current(generation)) {
        isLoading = false;
        emit();
      }
    }
  };
  const runStateAction = async (action: Exclude<SharedRoomAction, "refresh" | "invite">, key: string, operation: () => Promise<SharedSharingState>): Promise<boolean> => {
    if (disposed || context == null || transport === "down" || pending.has(key)) return false;
    const generation = lifecycleGeneration;
    pending = new Set(pending).add(key);
    pendingAction = action;
    failure = null;
    emit();
    try {
      const next = await operation();
      return applyState(next, generation);
    } catch (error: unknown) {
      if (current(generation)) {
        failure = error;
        emit();
      }
      return false;
    } finally {
      if (current(generation)) {
        const nextPending = new Set(pending);
        nextPending.delete(key);
        pending = nextPending;
        pendingAction = pending.size === 0 ? null : pendingAction;
        emit();
      }
    }
  };

  const stopSharing = client.subscribe("sharing", (payload) => {
    const next = projectSharingState(payload);
    if (next == null || disposed) return;
    state = next;
    failure = null;
    emit();
  });
  const stopTransport = client.subscribeTransport((next) => {
    if (disposed) return;
    transport = next;
    lifecycleGeneration += 1;
    if (next === "down") {
      state = null;
      clearTransient();
    }
    emit();
    if (next === "connected" && context != null) void refresh();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setContext(next) {
      if (disposed || sameContext(context, next)) return;
      lifecycleGeneration += 1;
      context = next;
      state = null;
      clearTransient();
      emit();
      if (next != null) void refresh();
    },
    refresh,
    async createRoomInvite() {
      if (disposed || context == null || !snapshot.isHost || transport === "down") return null;
      const generation = lifecycleGeneration;
      const requestId = `invite:${++requestGeneration}`;
      pending = new Set(pending).add(requestId);
      pendingAction = "invite";
      invite = null;
      failure = null;
      emit();
      try {
        const result = await typedCreateRoomInvite(client, { roomId: context.roomId });
        if (!current(generation)) return null;
        invite = result;
        if (result.status === "error") failure = result.message;
        return result;
      } catch (error: unknown) {
        if (current(generation)) failure = error;
        return null;
      } finally {
        if (current(generation)) {
          const nextPending = new Set(pending);
          nextPending.delete(requestId);
          pending = nextPending;
          pendingAction = pending.size === 0 ? null : pendingAction;
          emit();
        }
      }
    },
    respondToRoomJoinRequest(requestId, isApproved) {
      const request = snapshot.requests.find((item) => item.requestId === requestId);
      if (request == null || context == null) return Promise.resolve(false);
      return runStateAction("respond", `request:${requestId}`, () => typedRespondToRoomJoinRequest(client, { requestId, isApproved }));
    },
    addOwnAgent(agent) {
      if (context == null || !snapshot.isHost || snapshot.selfAgentIds.includes(agent.id) || snapshot.candidates.every((candidate) => candidate.id !== agent.id)) return Promise.resolve(false);
      return runStateAction("add", `agent:${agent.id}`, () => typedAddOwnAgentToSharedRoom(client, { roomId: context?.roomId ?? "", agentId: agent.id, agentName: agent.name }));
    },
    removeOwnAgent(agentId) {
      if (context == null || !snapshot.selfAgentIds.includes(agentId)) return Promise.resolve(false);
      return runStateAction("remove", `agent:${agentId}`, () => typedRemoveOwnAgentFromSharedRoom(client, { roomId: context?.roomId ?? "", agentId }));
    },
    leaveSharedRoom(targetAuthId) {
      if (context == null || state == null || state.selfAuthId == null) return Promise.resolve(false);
      const room = snapshot.room;
      if (room == null || (targetAuthId == null && !room.members.some((member) => member.authId === state?.selfAuthId))) return Promise.resolve(false);
      if (targetAuthId != null && (!snapshot.isHost || !room.members.some((member) => member.kind === "human" && member.authId === targetAuthId && member.authId !== room.hostAuthId))) return Promise.resolve(false);
      return runStateAction("leave", targetAuthId == null ? "leave" : `member:${targetAuthId}`, () => typedLeaveSharedRoom(client, { roomId: context?.roomId ?? "", ...(targetAuthId == null ? {} : { targetAuthId }) }));
    },
    reset() {
      if (disposed) return;
      lifecycleGeneration += 1;
      state = null;
      clearTransient();
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycleGeneration += 1;
      stopSharing();
      stopTransport();
      listeners.clear();
      context = null;
      state = null;
      clearTransient();
      snapshot = EMPTY_SNAPSHOT;
    }
  };
}
