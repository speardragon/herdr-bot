import { useCallback, useSyncExternalStore } from "react";
import { useStoreContext } from "../store/StoreProvider.tsx";
import { reducer } from "../store/reducer.ts";

export interface ActiveChatHandle {
  readonly activeChatId: string | null;
  setActiveChatId(chatId: string | null): void;
}

/** The chat currently open in the main column -- shared app-wide state, not per-component, so the
 * sidebar's selected row and the main column's header/transcript/composer all agree on it. */
export function useActiveChat(): ActiveChatHandle {
  const { store } = useStoreContext();
  const activeChatId = useSyncExternalStore(store.subscribe, () => store.getState().activeChatId);
  const setActiveChatId = useCallback(
    (chatId: string | null) => store.setState(reducer(store.getState(), { type: "chat/activated", chatId })),
    [store],
  );
  return { activeChatId, setActiveChatId };
}
