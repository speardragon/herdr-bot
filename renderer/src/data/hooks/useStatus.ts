import { useMemo } from "react";
import { presenceMembers, sidebarWaitingReason, statusDotTone, statusPhraseKind } from "../status.ts";
import type { PresenceMember, SidebarWaitingReason, StatusDotTone, StatusPhraseKind } from "../status.ts";
import { useChatMembers } from "./useChat.ts";
import type { ChatSummary } from "../types.ts";

export interface ChatStatus {
  readonly dot: StatusDotTone;
  readonly phrase: StatusPhraseKind;
  readonly sidebarWaitingReason: SidebarWaitingReason;
  /** Non-idle members, in order -- empty for a bot DM (a DM's own status is `phrase`/`dot` above). */
  readonly presence: readonly PresenceMember[];
}

/** Derives everything the sidebar row / header / presence strip need to render a chat's live status
 * from its `ChatSummary` (+, for a room, its resolved member summaries). Pure derivation wrapped as a
 * hook only so it can read `useChatMembers`; the underlying logic (src/data/status.ts) is plain and
 * unit-tested directly. */
export function useStatus(chat: ChatSummary | null): ChatStatus {
  const members = useChatMembers(chat);
  return useMemo(
    () => ({
      dot: chat == null ? null : statusDotTone(chat),
      phrase: chat == null ? null : statusPhraseKind(chat),
      sidebarWaitingReason: chat == null ? null : sidebarWaitingReason(chat),
      presence: chat == null || chat.kind !== "room" ? [] : presenceMembers(members),
    }),
    [chat, members],
  );
}
