/** Pure, seq-based read/unread model shared by the host store and the renderer read-receipt controller. */
export interface ReadState {
  readonly lastReadSeq: number;
  readonly lastIncomingSeq: number;
  readonly isManuallyUnread: boolean;
}

/**
 * Acknowledges everything through `throughSeq`, clamped to `latestSeq` so a stale client can never
 * claim to have read messages that do not exist yet. The watermark only moves forward: an older
 * acknowledgement (already superseded by a later `applyRead`) cannot roll `lastReadSeq` back.
 */
export function applyRead<T extends ReadState>(state: T, throughSeq: number, latestSeq: number): T {
  if (!Number.isSafeInteger(throughSeq) || throughSeq < 0) throw new Error("invalid read sequence");
  return { ...state, lastReadSeq: Math.max(state.lastReadSeq, Math.min(throughSeq, latestSeq)), isManuallyUnread: false };
}

export function hasUnread(state: ReadState): boolean {
  return state.isManuallyUnread || state.lastIncomingSeq > state.lastReadSeq;
}
