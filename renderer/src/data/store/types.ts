import type { AppSettings, ChatSummary, TranscriptEntry } from "../types.ts";

export interface TranscriptState {
  readonly entries: readonly TranscriptEntry[];
  /** Pass to `transcript.page` to load the next (older) page; `undefined` once the top is reached. */
  readonly nextBeforeSeq: number | undefined;
  readonly loadingOlder: boolean;
  /** False until the first `transcript.page` response for this chat has landed. */
  readonly loaded: boolean;
}

export interface IdentityState {
  readonly userName: string;
}

export interface AppState {
  readonly chats: readonly ChatSummary[];
  readonly activeChatId: string | null;
  readonly transcripts: Readonly<Record<string, TranscriptState>>;
  readonly identity: IdentityState | null;
  readonly settings: AppSettings | null;
  readonly pinnedChatIds: readonly string[];
  /** Bumped every time the client reports a missed event (`onResyncNeeded`); a provider effect watches
   * this to know when to re-fetch `chat.list` and any open transcript. Not meant to be read for its
   * value, only its identity change. */
  readonly resyncToken: number;
}

export const EMPTY_TRANSCRIPT: TranscriptState = {
  entries: [],
  nextBeforeSeq: undefined,
  loadingOlder: false,
  loaded: false,
};

export function createInitialState(): AppState {
  return {
    chats: [],
    activeChatId: null,
    transcripts: {},
    identity: null,
    settings: null,
    pinnedChatIds: [],
    resyncToken: 0,
  };
}
