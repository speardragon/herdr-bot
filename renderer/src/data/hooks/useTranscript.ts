import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useStoreContext } from "../store/StoreProvider.tsx";
import { reducer } from "../store/reducer.ts";
import { EMPTY_TRANSCRIPT } from "../store/types.ts";
import type { TranscriptState } from "../store/types.ts";

export interface TranscriptHandle extends TranscriptState {
  /** Loads the next page of older entries (`transcript.page` with `beforeSeq`); no-ops while already
   * loading or once the top of history is reached (`nextBeforeSeq === undefined` after the first load). */
  loadOlder(): void;
}

const PAGE_SIZE = 200;

/** The open transcript for one chat: loads the newest page on first use, exposes `loadOlder()` for
 * backward pagination, and otherwise stays live via `transcript.entryAppended/Updated` (wired once in
 * StoreProvider, not per-hook-instance). */
export function useTranscript(chatId: string | null): TranscriptHandle {
  const { store, client } = useStoreContext();

  const state = useSyncExternalStore(store.subscribe, () => (chatId == null ? EMPTY_TRANSCRIPT : (store.getState().transcripts[chatId] ?? EMPTY_TRANSCRIPT)));

  useEffect(() => {
    if (chatId == null || state.loaded) return;
    let cancelled = false;
    void client.call("transcript.page", { chatId, limit: PAGE_SIZE }).then((page) => {
      if (cancelled) return;
      store.setState(reducer(store.getState(), { type: "transcript/pageLoaded", chatId, page, direction: "initial" }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state.loaded` is read to skip a redundant
    // fetch, not as a trigger to re-fetch; `client`/`store` are stable for the app's lifetime.
  }, [chatId, state.loaded]);

  const loadOlder = useCallback(() => {
    if (chatId == null) return;
    const current = store.getState().transcripts[chatId] ?? EMPTY_TRANSCRIPT;
    if (current.loadingOlder || current.nextBeforeSeq === undefined) return;
    store.setState(reducer(store.getState(), { type: "transcript/loadingOlder", chatId, loading: true }));
    void client.call("transcript.page", { chatId, limit: PAGE_SIZE, beforeSeq: current.nextBeforeSeq }).then((page) => {
      store.setState(reducer(store.getState(), { type: "transcript/pageLoaded", chatId, page, direction: "older" }));
    });
  }, [chatId, client, store]);

  return { ...state, loadOlder };
}
