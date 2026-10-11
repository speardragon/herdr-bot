/**
 * Pure status-derivation helpers over `ChatSummary` (see docs/app-api.md "Events": there is no separate
 * presence event family -- everything is carried on the chat summary itself). No React/DOM here so this
 * is unit-testable directly.
 */
import type { ChatSummary } from "./types.ts";

export type StatusDotTone = "blocked" | "working" | null;

/** The sidebar/header avatar status dot: red when a bot needs approval or is
 * unreachable, orange when actively working, no dot otherwise. Rooms never show this dot -- they have
 * no single status of their own. */
export function statusDotTone(chat: ChatSummary): StatusDotTone {
  if (chat.kind !== "bot") return null;
  if (chat.awaitingUserResponse != null) return "blocked";
  if (chat.isRunning || chat.currentActivity != null) return "working";
  return null;
}

export type StatusPhraseKind = "needsApproval" | "working" | null;

/** The verb-phrase status attached to a bot's name in a room's presence strip or a DM's header
 * subtitle. Idle bots contribute nothing (omitted entirely, not listed as "idle"). */
export function statusPhraseKind(chat: ChatSummary): StatusPhraseKind {
  if (chat.kind !== "bot") return null;
  if (chat.awaitingUserResponse != null) return "needsApproval";
  if (chat.isRunning || chat.currentActivity != null) return "working";
  return null;
}

export type SidebarWaitingReason = "approval" | "offline" | "setup" | null;

/** The sidebar row's last-message preview is overridden with "Waiting for you: <reason>" while a bot
 * is blocked/unreachable -- this returns which reason, or null to use the ordinary
 * `lastMessagePreview` text instead. */
export function sidebarWaitingReason(chat: ChatSummary): SidebarWaitingReason {
  if (chat.kind !== "bot" || chat.awaitingUserResponse == null) return null;
  return chat.awaitingUserResponse.reason;
}

export interface PresenceMember {
  readonly name: string;
  readonly phrase: StatusPhraseKind;
}

/** Builds the ordered list of non-idle members for a room's presence-strip text (e.g.
 * `"Forge needs approval · Lens working"`, idle members omitted entirely). `members` must already be
 * resolved from the room's `memberIds` (a room has no status of its own). */
export function presenceMembers(members: readonly ChatSummary[]): PresenceMember[] {
  const result: PresenceMember[] = [];
  for (const member of members) {
    const phrase = statusPhraseKind(member);
    if (phrase != null) result.push({ name: member.name, phrase });
  }
  return result;
}
