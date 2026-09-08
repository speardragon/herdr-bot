// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4880000 (shared-room dialog projection; UTF-8; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6139090 (shared-room dialog projection; UTF-8; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

export interface SharedRoomMember {
  readonly kind: "human" | "agent";
  readonly authId: string;
  readonly agentId?: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
}

export interface SharedRoom {
  readonly roomId: string;
  readonly name: string;
  readonly hostAuthId: string;
  readonly members: readonly SharedRoomMember[];
  readonly avatarDataUrl?: string;
}

export interface SharedJoinRequest {
  readonly requestId: string;
  readonly roomId: string;
  readonly requesterAuthId: string;
  readonly requesterName: string;
  readonly requesterAvatarUrl?: string;
}

export interface SharedTypingUser {
  readonly roomId: string;
  readonly authId: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly expiresAtMs: number;
}

export interface SharedSharingState {
  readonly isEnabled: boolean;
  readonly selfAuthId: string | null;
  readonly pendingJoinRequests: readonly SharedJoinRequest[];
  readonly rooms: readonly SharedRoom[];
  readonly typingUsers: readonly SharedTypingUser[];
}

export interface SharedRoomAgent {
  readonly id: string;
  readonly name: string;
  readonly isGroup: boolean;
  readonly remoteRoom?: { readonly roomId: string } | null;
  readonly isSharedRoom?: boolean;
}

export interface SharedRoomContext {
  readonly roomId: string;
  readonly agentId: string;
  readonly accountGeneration: number;
  readonly agents: readonly SharedRoomAgent[];
}

export type SharedInviteResult =
  | { readonly status: "ok"; readonly shareUrl: string; readonly expiresAtMs: number; readonly roomId: string }
  | { readonly status: "error"; readonly message: string };

export type SharedRoomAction =
  | "refresh"
  | "invite"
  | "respond"
  | "add"
  | "remove"
  | "leave";

export interface SharedRoomSnapshot {
  readonly context: SharedRoomContext | null;
  readonly state: SharedSharingState | null;
  readonly room: SharedRoom | null;
  readonly isHost: boolean;
  readonly selfAgentIds: readonly string[];
  readonly candidates: readonly SharedRoomAgent[];
  readonly requests: readonly SharedJoinRequest[];
  readonly pending: ReadonlySet<string>;
  readonly pendingAction: SharedRoomAction | null;
  readonly invite: SharedInviteResult | null;
  readonly isLoading: boolean;
  readonly transport: "connected" | "down" | "unknown";
  readonly failure: unknown | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function projectMember(value: unknown): SharedRoomMember | null {
  if (!isRecord(value) || (value.kind !== "human" && value.kind !== "agent") || !nonEmptyString(value.authId)) return null;
  const displayName = typeof value.displayName === "string" ? value.displayName : "";
  if (value.kind === "human" && displayName.length === 0) return null;
  if (value.agentId !== undefined && !nonEmptyString(value.agentId)) return null;
  if (value.avatarDataUrl !== undefined && typeof value.avatarDataUrl !== "string") return null;
  return {
    kind: value.kind,
    authId: value.authId,
    ...(value.agentId === undefined ? {} : { agentId: value.agentId }),
    displayName,
    ...(typeof value.avatarDataUrl === "string" && value.avatarDataUrl.length > 0 ? { avatarUrl: value.avatarDataUrl } : {})
  };
}

function projectRoom(value: unknown): SharedRoom | null {
  if (!isRecord(value) || !nonEmptyString(value.roomId) || !nonEmptyString(value.name) || !nonEmptyString(value.hostAuthId) || !Array.isArray(value.members)) return null;
  const members = value.members.map(projectMember);
  if (members.some((member) => member == null)) return null;
  return {
    roomId: value.roomId,
    name: value.name,
    hostAuthId: value.hostAuthId,
    members: members as SharedRoomMember[],
    ...(typeof value.avatarDataUrl === "string" && value.avatarDataUrl.length > 0 ? { avatarDataUrl: value.avatarDataUrl } : {})
  };
}

function projectRequest(value: unknown): SharedJoinRequest | null {
  if (!isRecord(value) || !nonEmptyString(value.requestId) || !nonEmptyString(value.roomId) || !nonEmptyString(value.requesterAuthId) || !nonEmptyString(value.requesterName)) return null;
  if (value.requesterAvatarUrl !== undefined && typeof value.requesterAvatarUrl !== "string") return null;
  return {
    requestId: value.requestId,
    roomId: value.roomId,
    requesterAuthId: value.requesterAuthId,
    requesterName: value.requesterName,
    ...(typeof value.requesterAvatarUrl === "string" && value.requesterAvatarUrl.length > 0 ? { requesterAvatarUrl: value.requesterAvatarUrl } : {})
  };
}

function projectTypingUser(value: unknown): SharedTypingUser | null {
  if (!isRecord(value) || !nonEmptyString(value.roomId) || !nonEmptyString(value.authId) || !nonEmptyString(value.name) || typeof value.expiresAtMs !== "number" || !Number.isFinite(value.expiresAtMs)) return null;
  return {
    roomId: value.roomId,
    authId: value.authId,
    name: value.name,
    expiresAtMs: value.expiresAtMs,
    ...(typeof value.avatarUrl === "string" && value.avatarUrl.length > 0 ? { avatarUrl: value.avatarUrl } : {})
  };
}

/** The coordinator reply is rejected as a whole when any nested room row is malformed. */
export function projectSharingState(value: unknown): SharedSharingState | null {
  if (!isRecord(value) || typeof value.isEnabled !== "boolean" || (value.selfAuthId !== null && !nonEmptyString(value.selfAuthId)) || !Array.isArray(value.pendingJoinRequests) || !Array.isArray(value.rooms) || !Array.isArray(value.typingUsers)) return null;
  const pendingJoinRequests = value.pendingJoinRequests.map(projectRequest);
  const rooms = value.rooms.map(projectRoom);
  const typingUsers = value.typingUsers.map(projectTypingUser);
  if (pendingJoinRequests.some((item) => item == null) || rooms.some((item) => item == null) || typingUsers.some((item) => item == null)) return null;
  return {
    isEnabled: value.isEnabled,
    selfAuthId: value.selfAuthId,
    pendingJoinRequests: pendingJoinRequests as SharedJoinRequest[],
    rooms: rooms as SharedRoom[],
    typingUsers: typingUsers as SharedTypingUser[]
  };
}

export function projectInviteResult(value: unknown): SharedInviteResult | null {
  if (!isRecord(value) || value.status === "error" && !nonEmptyString(value.message)) return null;
  if (value.status === "error") {
    const message = value.message;
    return typeof message === "string" ? { status: "error", message } : null;
  }
  if (value.status !== "ok" || !nonEmptyString(value.shareUrl) || !nonEmptyString(value.roomId) || typeof value.expiresAtMs !== "number" || !Number.isFinite(value.expiresAtMs)) return null;
  return { status: "ok", shareUrl: value.shareUrl, expiresAtMs: value.expiresAtMs, roomId: value.roomId };
}

export function projectSharedRoomAgent(value: unknown): SharedRoomAgent | null {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.name) || typeof value.isGroup !== "boolean") return null;
  if (value.isSharedRoom !== undefined && typeof value.isSharedRoom !== "boolean") return null;
  if (value.remoteRoom !== undefined && value.remoteRoom !== null) {
    if (!isRecord(value.remoteRoom) || !nonEmptyString(value.remoteRoom.roomId)) return null;
    return { id: value.id, name: value.name, isGroup: value.isGroup, remoteRoom: { roomId: value.remoteRoom.roomId }, ...(value.isSharedRoom === undefined ? {} : { isSharedRoom: value.isSharedRoom }) };
  }
  return { id: value.id, name: value.name, isGroup: value.isGroup, remoteRoom: null, ...(value.isSharedRoom === undefined ? {} : { isSharedRoom: value.isSharedRoom }) };
}
