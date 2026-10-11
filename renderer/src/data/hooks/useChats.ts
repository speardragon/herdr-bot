import { useMemo, useSyncExternalStore } from "react";
import { useStoreContext } from "../store/StoreProvider.tsx";
import type { ChatSummary } from "../types.ts";

/** Every chat (bot DM or room), newest-activity first -- the sidebar list is ordered by
 * `lastActivityAt`, not alphabetically. */
export function useChats(): readonly ChatSummary[] {
  const { store } = useStoreContext();
  const chats = useSyncExternalStore(store.subscribe, () => store.getState().chats);
  return useMemo(() => [...chats].sort((a, b) => b.lastActivityAt - a.lastActivityAt), [chats]);
}
