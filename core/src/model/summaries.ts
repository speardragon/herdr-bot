import type { BotOnboarding } from "../bots/onboarding.ts";
import type { ReasoningEffort } from "../bots/launch-args.ts";
import type { BlockedPrompt } from "../herdr/blocked-prompt.ts";
import type { BotRuntime } from "../herdr/types.ts";
import type { BotProfile } from "../store/profile-store.ts";
import type { RoomConfig } from "../store/room-store.ts";
import type { StoredEntry } from "../store/transcript-store.ts";
import type { ChatViewState } from "../store/view-state-store.ts";
import { entryText } from "./entries.ts";
import { hasUnread } from "./read-state.ts";

export type AwaitingReason = "approval" | "offline" | "setup";

export interface HerdrBotFacts {
  readonly kind: string | null;
  readonly status: string;
  readonly paneId: string | null;
  readonly cwd: string | null;
  readonly adopted: boolean;
  readonly permissionMode: string;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  /** Present only while/after a quick-created bot is being onboarded; null for every other bot. */
  readonly onboarding: BotOnboarding | null;
  /** The approval/question form the bot's pane is showing while `status` is "blocked" (answered via
   * the `herdrBot.answerPrompt` RPC); null otherwise. */
  readonly prompt: BlockedPrompt | null;
}

/** Fields a chat summary carries to the app API (see core/src/app-api/mapping.ts). */
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

function awaiting(runtime: BotRuntime, onboarding: BotOnboarding | null): { reason: AwaitingReason } | null {
  if (onboarding != null) {
    // A failed setup is what needs the user; while it is still spawning/briefing/greeting the bot
    // is legitimately not online yet, so suppress the "offline" flash the empty runtime would give.
    if (onboarding.stage === "failed") return { reason: "setup" };
    if (onboarding.stage !== "ready") return null;
  }
  if (runtime.status === "blocked") return { reason: "approval" };
  if (runtime.status === "offline") return { reason: "offline" };
  return null;
}

/** Every AgentSummary re-sends this on every agent-upserted, and only a sidebar preview line ever reads
 * it (full text is still available untruncated via herdrBot.transcript/tail) -- cap it instead of
 * shipping an entire message (possibly megabytes) on every refresh. */
const PREVIEW_MAX_CHARS = 1_000;

/** Slices by code point, not UTF-16 code unit, so a multi-unit character (emoji, etc.) right at the
 * boundary is never split into an unpaired surrogate. */
function truncatePreview(text: string): string {
  const chars = [...text];
  return chars.length > PREVIEW_MAX_CHARS ? `${chars.slice(0, PREVIEW_MAX_CHARS).join("")}…` : text;
}

function lastFields(last: StoredEntry | null): Pick<AgentSummary, "lastEntry" | "lastMessageId" | "lastMessagePreview" | "newestEntryId"> {
  const text = last == null ? null : entryText(last);
  const preview = text == null ? null : truncatePreview(text);
  return { lastEntry: preview == null ? null : { kind: "text", text: preview }, lastMessageId: last?.id ?? null, lastMessagePreview: preview, newestEntryId: last?.id ?? null };
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
    title: profile.title ?? "",
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
    awaitingUserResponse: awaiting(runtime, profile.onboarding ?? null),
    notificationsEnabled: false,
    notifyOnUpdatesEnabled: profile.notifyOnUpdatesEnabled,
    isHiddenFromSidebar: profile.isHiddenFromSidebar,
    origin: "user",
    isGroup: false,
    memberIds: [],
    conversationPartnerIds: [],
    herdrBot: { kind: profile.kind, status: runtime.status, paneId: runtime.paneId ?? profile.herdr.paneId, cwd: profile.cwd, adopted: profile.adopted, permissionMode: profile.permissionMode, model: profile.model, reasoningEffort: profile.reasoningEffort, onboarding: profile.onboarding ?? null, prompt: runtime.prompt },
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
