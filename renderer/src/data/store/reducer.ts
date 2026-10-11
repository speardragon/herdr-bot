/**
 * Pure `(state, action) => state` reducer for the renderer's store (see create-store.ts for the
 * container it runs inside). Every branch returns a *new* object only for the parts that changed, and
 * returns the exact same `state` reference when an action is a no-op -- `Store.setState` relies on
 * reference equality to skip re-renders, and `useSyncExternalStore` relies on it to avoid tearing.
 */
import { applyTranscriptEntry, mergeTranscriptPage } from "../transcript-merge.ts";
import type { AppSettings, ChatSummary, TranscriptEntry, TranscriptPage } from "../types.ts";
import { EMPTY_TRANSCRIPT } from "./types.ts";
import type { AppState, IdentityState, TranscriptState } from "./types.ts";

export type Action =
  | { readonly type: "chats/replaced"; readonly chats: readonly ChatSummary[] }
  | { readonly type: "chats/changed"; readonly chat: ChatSummary }
  | { readonly type: "chat/activated"; readonly chatId: string | null }
  | { readonly type: "transcript/pageLoaded"; readonly chatId: string; readonly page: TranscriptPage; readonly direction: "initial" | "older" }
  | { readonly type: "transcript/loadingOlder"; readonly chatId: string; readonly loading: boolean }
  | { readonly type: "transcript/entryAppended"; readonly chatId: string; readonly entry: TranscriptEntry }
  | { readonly type: "transcript/entryUpdated"; readonly chatId: string; readonly entry: TranscriptEntry }
  | { readonly type: "identity/loaded"; readonly identity: IdentityState }
  | { readonly type: "settings/loaded"; readonly settings: AppSettings }
  | { readonly type: "pins/loaded"; readonly pinnedChatIds: readonly string[] }
  | { readonly type: "resync/requested" };

function replaceChat(chats: readonly ChatSummary[], chat: ChatSummary): readonly ChatSummary[] {
  const index = chats.findIndex((c) => c.id === chat.id);
  if (index === -1) return [...chats, chat];
  const next = [...chats];
  next[index] = chat;
  return next;
}

function updateTranscript(state: AppState, chatId: string, updater: (current: TranscriptState) => TranscriptState): AppState {
  const current = state.transcripts[chatId] ?? EMPTY_TRANSCRIPT;
  const updated = updater(current);
  if (updated === current) return state;
  return { ...state, transcripts: { ...state.transcripts, [chatId]: updated } };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "chats/replaced":
      return { ...state, chats: action.chats };

    case "chats/changed":
      return { ...state, chats: replaceChat(state.chats, action.chat) };

    case "chat/activated":
      return action.chatId === state.activeChatId ? state : { ...state, activeChatId: action.chatId };

    case "transcript/pageLoaded":
      return updateTranscript(state, action.chatId, (current) => ({
        entries: mergeTranscriptPage(current.entries, action.page.entries),
        nextBeforeSeq: action.direction === "initial" ? action.page.nextBeforeSeq : (action.page.nextBeforeSeq ?? current.nextBeforeSeq),
        loadingOlder: false,
        loaded: true,
      }));

    case "transcript/loadingOlder":
      return updateTranscript(state, action.chatId, (current) =>
        current.loadingOlder === action.loading ? current : { ...current, loadingOlder: action.loading },
      );

    case "transcript/entryAppended":
    case "transcript/entryUpdated":
      return updateTranscript(state, action.chatId, (current) => ({
        ...current,
        entries: applyTranscriptEntry(current.entries, action.entry),
      }));

    case "identity/loaded":
      return { ...state, identity: action.identity };

    case "settings/loaded":
      return { ...state, settings: action.settings };

    case "pins/loaded":
      return { ...state, pinnedChatIds: action.pinnedChatIds };

    case "resync/requested":
      return { ...state, resyncToken: state.resyncToken + 1 };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
