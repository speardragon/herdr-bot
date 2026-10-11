/**
 * Pure ordering/visibility logic for the sidebar chat list (newest-activity first, not
 * alphabetical). Pin state isn't on `ChatSummary` at all -- it's layered on top here from the
 * separate `usePins()` id list.
 *
 * Kept free of React/DOM so it's directly unit-testable.
 */
import type { ChatSummary } from "../../data/types.ts";

/** A chat hidden via `chat.setHidden` is dropped from the sidebar -- except the chat currently open,
 * which stays visible (hiding the chat you're looking at would strand you with no way back to it
 * short of the command palette; a deliberate design decision, see README). */
export function visibleChats(chats: readonly ChatSummary[], activeChatId: string | null): readonly ChatSummary[] {
  return chats.filter((chat) => !chat.isHiddenFromSidebar || chat.id === activeChatId);
}

export interface OrderedChats {
  readonly pinned: readonly ChatSummary[];
  readonly rest: readonly ChatSummary[];
}

function byRecency(a: ChatSummary, b: ChatSummary): number {
  return b.lastActivityAt - a.lastActivityAt;
}

/** Splits into pinned/unpinned groups (pinned rendered first), each sorted newest-activity-first
 * independently -- pinning never changes a chat's relative order within its own group. */
export function orderChats(chats: readonly ChatSummary[], pinnedChatIds: readonly string[]): OrderedChats {
  const pinnedSet = new Set(pinnedChatIds);
  const pinned: ChatSummary[] = [];
  const rest: ChatSummary[] = [];
  for (const chat of chats) {
    if (pinnedSet.has(chat.id)) pinned.push(chat);
    else rest.push(chat);
  }
  return { pinned: [...pinned].sort(byRecency), rest: [...rest].sort(byRecency) };
}
