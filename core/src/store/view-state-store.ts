import { hostPaths } from "../config.ts";
import { applyRead as applyReadState } from "../model/read-state.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";

export interface ChatViewState {
  readonly lastViewedAt: number;
  readonly lastActivityAt: number;
  readonly isManuallyUnread: boolean;
  readonly lastReadSeq: number;
  readonly lastIncomingSeq: number;
  readonly lastMessageAt: number;
}

export const EMPTY_VIEW_STATE: ChatViewState = {
  lastViewedAt: 0,
  lastActivityAt: 0,
  isManuallyUnread: false,
  lastReadSeq: 0,
  lastIncomingSeq: 0,
  lastMessageAt: 0,
};

/**
 * The persisted shape. `lastReadSeq`/`lastIncomingSeq`/`lastMessageAt` are optional here (and only
 * here) so the store can tell "an old file that predates seq tracking" apart from "a chat that was
 * genuinely acknowledged at seq 0" -- {@link ViewStateStore.hasSeqFields} depends on that distinction.
 * `get()` always returns the fully-defaulted {@link ChatViewState}.
 */
interface RawChatViewState {
  readonly lastViewedAt: number;
  readonly lastActivityAt: number;
  readonly isManuallyUnread: boolean;
  readonly lastReadSeq?: number;
  readonly lastIncomingSeq?: number;
  readonly lastMessageAt?: number;
}

type ViewStateMap = Readonly<Record<string, RawChatViewState>>;

function projectMap(value: unknown): ViewStateMap | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result: Record<string, RawChatViewState> = {};
  for (const [chatId, state] of Object.entries(value as Record<string, unknown>)) {
    if (typeof state !== "object" || state === null) continue;
    const candidate = state as Record<string, unknown>;
    result[chatId] = {
      lastViewedAt: typeof candidate.lastViewedAt === "number" ? candidate.lastViewedAt : 0,
      lastActivityAt: typeof candidate.lastActivityAt === "number" ? candidate.lastActivityAt : 0,
      isManuallyUnread: candidate.isManuallyUnread === true,
      ...(typeof candidate.lastReadSeq === "number" ? { lastReadSeq: candidate.lastReadSeq } : {}),
      ...(typeof candidate.lastIncomingSeq === "number" ? { lastIncomingSeq: candidate.lastIncomingSeq } : {}),
      ...(typeof candidate.lastMessageAt === "number" ? { lastMessageAt: candidate.lastMessageAt } : {}),
    };
  }
  return result;
}

function toChatViewState(raw: RawChatViewState): ChatViewState {
  return {
    lastViewedAt: raw.lastViewedAt,
    lastActivityAt: raw.lastActivityAt,
    isManuallyUnread: raw.isManuallyUnread,
    lastReadSeq: raw.lastReadSeq ?? 0,
    lastIncomingSeq: raw.lastIncomingSeq ?? 0,
    lastMessageAt: raw.lastMessageAt ?? 0,
  };
}

export class ViewStateStore {
  readonly path: string;
  #map: ViewStateMap | null = null;

  constructor(home: string) {
    this.path = hostPaths.viewState(home);
  }

  get(chatId: string): ChatViewState {
    return toChatViewState(this.#getRaw(chatId));
  }

  /** True once seq fields have been persisted for this chat (migration already ran, or the chat is new). */
  hasSeqFields(chatId: string): boolean {
    return this.#load()[chatId]?.lastReadSeq !== undefined;
  }

  /** One-time backfill of seq fields for a chat whose store predates seq-based read tracking. */
  migrateSeqFields(chatId: string, fields: { readonly lastReadSeq: number; readonly lastIncomingSeq: number; readonly lastMessageAt: number }): ChatViewState {
    return this.#put(chatId, { ...this.#getRaw(chatId), ...fields });
  }

  /** Records a bot reply as the new high-water mark for "incoming" messages. Never affects read state. */
  recordIncoming(chatId: string, seq: number, timestampMs: number): ChatViewState {
    const raw = this.#getRaw(chatId);
    return this.#put(chatId, {
      ...raw,
      lastActivityAt: timestampMs,
      lastIncomingSeq: Math.max(raw.lastIncomingSeq ?? 0, seq),
      lastMessageAt: timestampMs,
    });
  }

  /** Records the user's own message. Only bumps activity/lastMessageAt -- sending no longer implies reading. */
  recordOutgoing(chatId: string, timestampMs: number): ChatViewState {
    return this.#put(chatId, { ...this.#getRaw(chatId), lastActivityAt: timestampMs, lastMessageAt: timestampMs });
  }

  /** Records non-message activity (e.g. a notice): bumps `lastActivityAt` only -- not incoming, not outgoing. */
  recordActivity(chatId: string, timestampMs: number): ChatViewState {
    return this.#put(chatId, { ...this.#getRaw(chatId), lastActivityAt: timestampMs });
  }

  /** Seq-based read acknowledgement: moves `lastReadSeq` forward, clamped to `latestSeq`, clearing manual unread. */
  applyRead(chatId: string, throughSeq: number, latestSeq: number, now: number): ChatViewState {
    const raw = this.#getRaw(chatId);
    const read = applyReadState(toChatViewState(raw), throughSeq, latestSeq);
    return this.#put(chatId, { ...read, lastViewedAt: now });
  }

  setManuallyUnread(chatId: string, isUnread: boolean): ChatViewState {
    return this.#put(chatId, { ...this.#getRaw(chatId), isManuallyUnread: isUnread });
  }

  delete(chatId: string): void {
    const { [chatId]: _removed, ...rest } = this.#load();
    this.#save(rest);
  }

  #getRaw(chatId: string): RawChatViewState {
    return this.#load()[chatId] ?? { lastViewedAt: 0, lastActivityAt: 0, isManuallyUnread: false };
  }

  #put(chatId: string, state: RawChatViewState): ChatViewState {
    this.#save({ ...this.#load(), [chatId]: state });
    return toChatViewState(state);
  }

  #load(): ViewStateMap {
    if (this.#map == null) this.#map = readJsonFile(this.path, projectMap) ?? {};
    return this.#map;
  }

  #save(map: ViewStateMap): void {
    this.#map = map;
    writeJsonFileAtomic(this.path, map);
  }
}
