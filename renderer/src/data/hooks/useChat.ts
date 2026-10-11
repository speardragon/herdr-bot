import { useMemo, useSyncExternalStore } from "react";
import { useStoreContext } from "../store/StoreProvider.tsx";
import type { ChatSummary } from "../types.ts";

/** A single chat by id, or `null` if it doesn't exist (yet, or ever). Returns the exact `ChatSummary`
 * object from the store -- stable by reference until that chat's summary actually changes. */
export function useChat(chatId: string | null): ChatSummary | null {
  const { store } = useStoreContext();
  return useSyncExternalStore(store.subscribe, () => {
    if (chatId == null) return null;
    return store.getState().chats.find((chat) => chat.id === chatId) ?? null;
  });
}

/** Resolves a room's member ids to their `ChatSummary` rows (for the stacked avatar / presence strip).
 * Members that can't be found (e.g. a deleted bot) are silently skipped.
 *
 * Reads the raw `chats` array via `useSyncExternalStore` (a stable reference the store never mutates
 * in place) and derives the member list with `useMemo` -- `getSnapshot` itself must never allocate,
 * or React sees a "new" value on every render and tears/loops. */
export function useChatMembers(chat: ChatSummary | null): readonly ChatSummary[] {
  const { store } = useStoreContext();
  const chats = useSyncExternalStore(store.subscribe, () => store.getState().chats);
  return useMemo(() => {
    if (chat == null || chat.memberIds.length === 0) return [];
    const members: ChatSummary[] = [];
    for (const id of chat.memberIds) {
      const member = chats.find((c) => c.id === id);
      if (member != null) members.push(member);
    }
    return members;
  }, [chat, chats]);
}
