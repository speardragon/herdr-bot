import type { ProductionCoordinatorClient } from "../../../../production/coordinator-client";
import { projectInviteResult, projectSharingState, type SharedInviteResult, type SharedSharingState } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5576811 (sharing RPC method table; UTF-8; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=7000285 (sharing RPC method table; UTF-8; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence src/app/dist/host/host-main.cjs#byteOffset=17927694 (host sharing dispatch; UTF-8; SHA256 b0e529081dd0f7fe4b162eebdf8f796aff99b287cc47ee3e48a1c86c332025cc)

type Client = Pick<ProductionCoordinatorClient, "call">;

function requireState(value: unknown): SharedSharingState {
  const state = projectSharingState(value);
  if (state == null) throw new TypeError("Sharing returned a malformed state");
  return state;
}

function requireInvite(value: unknown): SharedInviteResult {
  const result = projectInviteResult(value);
  if (result == null) throw new TypeError("Sharing returned a malformed invite result");
  return result;
}

export function typedGetSharingState(client: Client): Promise<SharedSharingState> {
  return client.call("getSharingState").then(requireState);
}

export function typedCreateRoomInvite(client: Client, args: { readonly roomId: string }): Promise<SharedInviteResult> {
  if (args.roomId.length === 0) return Promise.reject(new TypeError("createRoomInvite requires a room id"));
  return client.call("createRoomInvite", { roomId: args.roomId }).then(requireInvite);
}

export function typedRespondToRoomJoinRequest(client: Client, args: { readonly requestId: string; readonly isApproved: boolean }): Promise<SharedSharingState> {
  if (args.requestId.length === 0) return Promise.reject(new TypeError("respondToRoomJoinRequest requires a request id"));
  return client.call("respondToRoomJoinRequest", { requestId: args.requestId, isApproved: args.isApproved }).then(requireState);
}

export function typedAddOwnAgentToSharedRoom(client: Client, args: { readonly roomId: string; readonly agentId: string; readonly agentName: string }): Promise<SharedSharingState> {
  if (args.roomId.length === 0 || args.agentId.length === 0 || args.agentName.length === 0) return Promise.reject(new TypeError("addOwnAgentToSharedRoom requires room and agent identity"));
  return client.call("addOwnAgentToSharedRoom", { roomId: args.roomId, agentId: args.agentId, agentName: args.agentName }).then(requireState);
}

export function typedRemoveOwnAgentFromSharedRoom(client: Client, args: { readonly roomId: string; readonly agentId: string }): Promise<SharedSharingState> {
  if (args.roomId.length === 0 || args.agentId.length === 0) return Promise.reject(new TypeError("removeOwnAgentFromSharedRoom requires room and agent identity"));
  return client.call("removeOwnAgentFromSharedRoom", { roomId: args.roomId, agentId: args.agentId }).then(requireState);
}

export function typedLeaveSharedRoom(client: Client, args: { readonly roomId: string; readonly targetAuthId?: string }): Promise<SharedSharingState> {
  if (args.roomId.length === 0) return Promise.reject(new TypeError("leaveSharedRoom requires a room id"));
  return client.call("leaveSharedRoom", { roomId: args.roomId, ...(args.targetAuthId == null ? {} : { targetAuthId: args.targetAuthId }) }).then(requireState);
}
