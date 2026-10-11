import { useEffect, useRef } from "react";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import type { ChatSummary, TranscriptEntry } from "../../data/types.ts";

/**
 * Marks the chat read when it's visible (window focused). `chat.markRead` is, per
 * docs/app-api.md, the **only** way to clear `hasUnread` -- paging the transcript never does. Marks
 * through the newest loaded entry's `seq` whenever the window is focused+visible and that `seq` is ahead
 * of `chat.lastReadSeq`, and re-checks on `focus`/`visibilitychange` so leaving the chat open in a
 * background/unfocused window doesn't silently clear unread the moment a new message streams in.
 */
export function useMarkRead(chatId: string | null, chat: ChatSummary | null, loaded: boolean, entries: readonly TranscriptEntry[]): void {
  const { client } = useStoreContext();
  const lastMarkedRef = useRef<number>(0);

  useEffect(() => {
    lastMarkedRef.current = 0;
  }, [chatId]);

  useEffect(() => {
    if (chatId == null || chat == null || !loaded) return;
    const newestSeq = entries.length > 0 ? entries[entries.length - 1]!.seq : 0;

    function tryMark() {
      if (newestSeq <= chat!.lastReadSeq) return;
      if (newestSeq <= lastMarkedRef.current) return;
      if (typeof document === "undefined" || !document.hasFocus() || document.visibilityState !== "visible") return;
      lastMarkedRef.current = newestSeq;
      void client.call("chat.markRead", { chatId: chatId!, throughSeq: newestSeq }).catch(() => {
        lastMarkedRef.current = 0;
      });
    }

    tryMark();
    window.addEventListener("focus", tryMark);
    document.addEventListener("visibilitychange", tryMark);
    return () => {
      window.removeEventListener("focus", tryMark);
      document.removeEventListener("visibilitychange", tryMark);
    };
  }, [chatId, chat, loaded, entries, client]);
}
