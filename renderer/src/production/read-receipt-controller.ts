/**
 * Tracks, per chat, the highest seq the renderer has actually acknowledged as read and any in-flight
 * `markChatRead` request -- independent of transcript loading. Loading (or preloading/searching) a
 * transcript page must never itself acknowledge messages; only `acknowledge()` does, and only with the
 * max seq of a page the renderer actually rendered.
 */
export interface ReadReceiptControllerDeps {
  readonly markChatRead: (id: string, throughSeq: number) => Promise<{ readonly lastReadSeq: number }>;
}

export interface ReadReceiptController {
  /** Highest seq successfully acknowledged for a chat (0 if never acknowledged). */
  ackedSeqFor(id: string): number;
  /** True while an ACK request for this chat is in flight. */
  isPending(id: string): boolean;
  /**
   * Acknowledges everything through `throughSeq` for a chat. A no-op if that seq is already covered
   * by the last successful ACK. If an ACK is already in flight for this chat, a higher `throughSeq`
   * is queued and sent once the in-flight request settles; a failed ACK leaves the watermark
   * untouched so the chat stays unread until a later call (e.g. on reconnect or the next open) retries.
   */
  acknowledge(id: string, throughSeq: number): Promise<void>;
  /** Drops all tracked state for a chat id (e.g. it was deleted, or its transcript was cleared/reset).
   *  Without this, a chat id later reused (delete + recreate with the same id) would inherit the old
   *  chat's watermark and silently swallow every ACK for the new chat until it caught back up. */
  forget(id: string): void;
  /** Drops every chat's tracked state (e.g. the signed-in account changed). Unlike dispose(), the
   *  controller remains usable afterwards. */
  reset(): void;
  dispose(): void;
}

interface ChatAckState {
  ackedSeq: number;
  pendingSeq: number | null;
  queuedSeq: number | null;
}

export const canAcknowledge = (selected: boolean, loaded: boolean, visible: boolean, focused: boolean): boolean =>
  selected && loaded && visible && focused;

export function createReadReceiptController(deps: ReadReceiptControllerDeps): ReadReceiptController {
  const states = new Map<string, ChatAckState>();
  let disposed = false;

  const stateFor = (id: string): ChatAckState => {
    const existing = states.get(id);
    if (existing != null) return existing;
    const created: ChatAckState = { ackedSeq: 0, pendingSeq: null, queuedSeq: null };
    states.set(id, created);
    return created;
  };

  const send = async (id: string, throughSeq: number): Promise<void> => {
    const state = stateFor(id);
    state.pendingSeq = throughSeq;
    try {
      const result = await deps.markChatRead(id, throughSeq);
      if (disposed) return;
      const acked = typeof result?.lastReadSeq === "number" && Number.isFinite(result.lastReadSeq) ? result.lastReadSeq : throughSeq;
      state.ackedSeq = Math.max(state.ackedSeq, acked);
    } catch {
      // Swallow: a failed ACK must not raise/crash the caller. lastReadSeq is left as-is; the chat
      // stays (or remains) unread until a later acknowledge() call retries successfully.
    } finally {
      state.pendingSeq = null;
      const queuedSeq = state.queuedSeq;
      state.queuedSeq = null;
      if (!disposed && queuedSeq != null && queuedSeq > state.ackedSeq) await send(id, queuedSeq);
    }
  };

  return {
    ackedSeqFor: (id) => states.get(id)?.ackedSeq ?? 0,
    isPending: (id) => states.get(id)?.pendingSeq != null,
    async acknowledge(id, throughSeq) {
      if (disposed || !Number.isInteger(throughSeq) || throughSeq < 0) return;
      const state = stateFor(id);
      if (throughSeq <= state.ackedSeq) return;
      if (state.pendingSeq != null) {
        if (throughSeq > state.pendingSeq) state.queuedSeq = state.queuedSeq == null ? throughSeq : Math.max(state.queuedSeq, throughSeq);
        return;
      }
      await send(id, throughSeq);
    },
    forget(id) {
      states.delete(id);
    },
    reset() {
      states.clear();
    },
    dispose() {
      disposed = true;
      states.clear();
    }
  };
}
