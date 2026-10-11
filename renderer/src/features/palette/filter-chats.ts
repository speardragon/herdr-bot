/**
 * Pure chat-name search for the command palette. `searchAgents({query})` is a substring match over
 * name/description only, not message text -- message text is `message.search`'s job, see
 * `PaletteSlot`. Filtering the already-loaded `useChats()` list
 * client-side (rather than calling `chat.search`) keeps results reactive to live chat updates; see the
 * README for why.
 */
import type { ChatSummary } from "../../data/types.ts";

export function matchesChatQuery(chat: Pick<ChatSummary, "name" | "description">, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return chat.name.toLowerCase().includes(needle) || chat.description.toLowerCase().includes(needle);
}

export function filterChats(chats: readonly ChatSummary[], query: string): readonly ChatSummary[] {
  return chats.filter((chat) => matchesChatQuery(chat, query));
}

export function filterChatsByKind(chats: readonly ChatSummary[], query: string, kind: ChatSummary["kind"]): readonly ChatSummary[] {
  return filterChats(chats, query).filter((chat) => chat.kind === kind);
}
