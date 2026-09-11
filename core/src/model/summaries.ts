import type { BotRuntime } from "../herdr/types.ts";
import type { BotProfile } from "../store/profile-store.ts";
import type { RoomConfig } from "../store/room-store.ts";
import type { StoredEntry } from "../store/transcript-store.ts";
import type { ChatViewState } from "../store/view-state-store.ts";
import { entryText, lastEntryPreview } from "./entries.ts";
import { hasUnread } from "./read-state.ts";

export type AwaitingReason = "approval" | "offline" | "setup";

export interface HerdrBotFacts {
  readonly kind: string | null;
  readonly status: string;
  readonly paneId: string | null;
  readonly cwd: string | null;
  readonly adopted: boolean;
  readonly permissionMode: string;
}

/** Field set read by the grok-bot renderer's projectRendererAgent(). */
export interface AgentSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly title: string;
  readonly avatarDataUrl: null;
  readonly avatarVersion: null;
  readonly avatarShape: string | null;
  readonly avatarColor: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly isRunning: boolean;
  readonly isComposingMessage: boolean;
  readonly currentActivity: { readonly verb: "working" } | null;
  readonly lastEntry: { readonly kind: "text"; readonly text: string } | null;
  readonly lastMessageId: string | null;
  readonly lastMessagePreview: string | null;
  readonly newestEntryId: string | null;
  readonly hasUnread: boolean;
  readonly unreadCount: number;
  readonly lastViewedAt: number;
  readonly lastActivityAt: number;
  readonly lastReadSeq: number;
  readonly lastIncomingSeq: number;
  readonly lastMessageAt: number;
  readonly awaitingUserResponse: { readonly reason: AwaitingReason } | null;
  readonly notificationsEnabled: boolean;
  readonly notifyOnUpdatesEnabled: boolean;
  readonly isHiddenFromSidebar: boolean;
  readonly origin: "user";
  readonly isGroup: boolean;
  readonly memberIds: readonly string[];
  readonly conversationPartnerIds: readonly string[];
  readonly herdrBot: HerdrBotFacts | null;
}

function unread(view: ChatViewState): boolean {
  return hasUnread(view);
}

function awaiting(runtime: BotRuntime): { reason: AwaitingReason } | null {
  if (runtime.status === "blocked") return { reason: "approval" };
  if (runtime.status === "offline") return { reason: "offline" };
  return null;
}

function lastFields(last: StoredEntry | null): Pick<AgentSummary, "lastEntry" | "lastMessageId" | "lastMessagePreview" | "newestEntryId"> {
  const text = last == null ? null : entryText(last);
  return { lastEntry: lastEntryPreview(last), lastMessageId: last?.id ?? null, lastMessagePreview: text, newestEntryId: last?.id ?? null };
}

export function botSummary(args: {
  readonly profile: BotProfile;
  readonly runtime: BotRuntime;
  readonly last: StoredEntry | null;
  readonly view: ChatViewState;
  readonly isTurnActive: boolean;
}): AgentSummary {
  const { profile, runtime, view } = args;
  const isRunning = runtime.status === "working" || args.isTurnActive;
  const isUnread = unread(view);
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    title: "",
    avatarDataUrl: null,
    avatarVersion: null,
    avatarShape: profile.avatarShape,
    avatarColor: profile.avatarColor,
    createdAt: profile.createdAt,
    updatedAt: Math.max(profile.updatedAt, view.lastActivityAt),
    isRunning,
    isComposingMessage: false,
    currentActivity: isRunning ? { verb: "working" } : null,
    ...lastFields(args.last),
    hasUnread: isUnread,
    unreadCount: isUnread ? 1 : 0,
    lastViewedAt: view.lastViewedAt,
    lastActivityAt: view.lastActivityAt,
    lastReadSeq: view.lastReadSeq,
    lastIncomingSeq: view.lastIncomingSeq,
    lastMessageAt: view.lastMessageAt,
    awaitingUserResponse: awaiting(runtime),
    notificationsEnabled: false,
    notifyOnUpdatesEnabled: profile.notifyOnUpdatesEnabled,
    isHiddenFromSidebar: profile.isHiddenFromSidebar,
    origin: "user",
    isGroup: false,
    memberIds: [],
    conversationPartnerIds: [],
    herdrBot: { kind: profile.kind, status: runtime.status, paneId: runtime.paneId ?? profile.herdr.paneId, cwd: profile.cwd, adopted: profile.adopted, permissionMode: profile.permissionMode },
  };
}

export function roomSummary(args: {
  readonly room: RoomConfig;
  readonly last: StoredEntry | null;
  readonly view: ChatViewState;
  readonly isTurnActive: boolean;
}): AgentSummary {
  const { room, view } = args;
  const isUnread = unread(view);
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    title: "",
    avatarDataUrl: null,
    avatarVersion: null,
    avatarShape: null,
    avatarColor: null,
    createdAt: room.createdAt,
    updatedAt: Math.max(room.updatedAt, view.lastActivityAt),
    isRunning: args.isTurnActive,
    isComposingMessage: false,
    currentActivity: args.isTurnActive ? { verb: "working" } : null,
    ...lastFields(args.last),
    hasUnread: isUnread,
    unreadCount: isUnread ? 1 : 0,
    lastViewedAt: view.lastViewedAt,
    lastActivityAt: view.lastActivityAt,
    lastReadSeq: view.lastReadSeq,
    lastIncomingSeq: view.lastIncomingSeq,
    lastMessageAt: view.lastMessageAt,
    awaitingUserResponse: null,
    notificationsEnabled: false,
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: room.isHiddenFromSidebar,
    origin: "user",
    isGroup: true,
    memberIds: room.memberIds,
    conversationPartnerIds: [],
    herdrBot: null,
  };
}
