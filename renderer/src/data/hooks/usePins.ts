import { useCallback, useSyncExternalStore } from "react";
import { useBridge } from "../BridgeContext.tsx";
import { useStoreContext } from "../store/StoreProvider.tsx";

export interface PinsHandle {
  readonly pinnedChatIds: readonly string[];
  isPinned(chatId: string): boolean;
  togglePin(chatId: string): void;
}

/** Pinned-chat ids: a desktop-local UI preference, not host state -- it lives entirely in the generic
 * Electron-bridge settings KV (`window.herdrBot.pins`). */
export function usePins(): PinsHandle {
  const { store } = useStoreContext();
  const bridge = useBridge();
  const pinnedChatIds = useSyncExternalStore(store.subscribe, () => store.getState().pinnedChatIds);

  const isPinned = useCallback((chatId: string) => pinnedChatIds.includes(chatId), [pinnedChatIds]);

  const togglePin = useCallback(
    (chatId: string) => {
      const next = pinnedChatIds.includes(chatId) ? pinnedChatIds.filter((id) => id !== chatId) : [...pinnedChatIds, chatId];
      store.setState({ ...store.getState(), pinnedChatIds: next });
      void bridge.pins.set(next);
    },
    [bridge, pinnedChatIds, store],
  );

  return { pinnedChatIds, isPinned, togglePin };
}
