import { hostPaths, type HostConfig } from "../config.ts";
import type { GroupMessage } from "../group/group-chat.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import type { HostEvents } from "../host-events.ts";
import { botMessageEntry, noticeEntry, toGroupMessage, toggleReaction, userMessageEntry, type Author } from "../model/entries.ts";
import { isRoomId } from "../model/ids.ts";
import { botSummary, roomSummary, type AgentSummary } from "../model/summaries.ts";
import type { ProfileStore } from "../store/profile-store.ts";
import type { RoomStore } from "../store/room-store.ts";
import { TranscriptStore, type NewEntry, type StoredEntry, type TranscriptPage } from "../store/transcript-store.ts";
import type { ViewStateStore } from "../store/view-state-store.ts";
import { ControlError } from "../control/protocol.ts";

export interface ChatServiceDeps {
  readonly config: HostConfig;
  readonly profiles: ProfileStore;
  readonly rooms: RoomStore;
  readonly view: ViewStateStore;
  readonly mirror: StatusMirror;
  readonly events: HostEvents;
  readonly isTurnActive: (chatId: string) => boolean;
  readonly now?: () => number;
}

export type ChatKind = "bot" | "room";

export class ChatService {
  readonly #deps: ChatServiceDeps;
  readonly #transcripts = new Map<string, TranscriptStore>();

  constructor(deps: ChatServiceDeps) {
    this.#deps = deps;
  }

  chatKind(chatId: string): ChatKind | null {
    if (isRoomId(chatId)) return this.#deps.rooms.get(chatId) == null ? null : "room";
    return this.#deps.profiles.get(chatId) == null ? null : "bot";
  }

  transcript(chatId: string): TranscriptStore {
    const cached = this.#transcripts.get(chatId);
    if (cached != null) return cached;
    const path = isRoomId(chatId) ? hostPaths.roomTranscript(this.#deps.config.home, chatId) : hostPaths.botTranscript(this.#deps.config.home, chatId);
    const store = new TranscriptStore(path);
    this.#transcripts.set(chatId, store);
    return store;
  }

  appendUser(chatId: string, args: { readonly content: string; readonly clientNonce?: string; readonly richText?: string; readonly replyTo?: string }): StoredEntry {
    this.#requireChat(chatId);
    const entry = userMessageEntry({ ...args, timestampMs: this.#now(), userName: this.#deps.config.userName });
    return this.#append(chatId, entry, true);
  }

  appendBot(chatId: string, author: Author, content: string): StoredEntry {
    this.#requireChat(chatId);
    return this.#append(chatId, botMessageEntry({ content, author, timestampMs: this.#now() }), false);
  }

  appendNotice(chatId: string, content: string): StoredEntry {
    this.#requireChat(chatId);
    return this.#append(chatId, noticeEntry({ content, timestampMs: this.#now() }), false);
  }

  history(chatId: string): GroupMessage[] {
    return this.transcript(chatId).readAll().flatMap((entry) => {
      const message = toGroupMessage(entry);
      return message == null ? [] : [message];
    });
  }

  tail(chatId: string, limit: number, beforeSeq?: number): TranscriptPage {
    return this.transcript(chatId).tail(limit, beforeSeq);
  }

  thread(chatId: string, rootId: string): StoredEntry[] {
    return this.transcript(chatId).readAll().filter((entry) => entry.id === rootId || entry.replyTo === rootId);
  }

  react(chatId: string, entryId: string, emoji: string): StoredEntry | null {
    const updated = this.transcript(chatId).update(entryId, (entry) => toggleReaction(entry, emoji));
    if (updated != null) this.#deps.events.emit("transcript", { type: "updated", agentId: chatId, entry: updated });
    return updated;
  }

  markViewed(chatId: string): void {
    this.#deps.view.markViewed(chatId, this.#now());
    this.emitUpsert(chatId);
  }

  setUnread(chatId: string, isUnread: boolean): void {
    this.#deps.view.setManuallyUnread(chatId, isUnread);
    this.emitUpsert(chatId);
  }

  summary(chatId: string): AgentSummary | null {
    const view = this.#deps.view.get(chatId);
    const isTurnActive = this.#deps.isTurnActive(chatId);
    if (isRoomId(chatId)) {
      const room = this.#deps.rooms.get(chatId);
      return room == null ? null : roomSummary({ room, last: this.transcript(chatId).last(), view, isTurnActive });
    }
    const profile = this.#deps.profiles.get(chatId);
    return profile == null ? null : botSummary({ profile, runtime: this.#deps.mirror.get(chatId), last: this.transcript(chatId).last(), view, isTurnActive });
  }

  listSummaries(): AgentSummary[] {
    const ids = [...this.#deps.profiles.list().map((profile) => profile.id), ...this.#deps.rooms.list().map((room) => room.id)];
    return ids.flatMap((id) => {
      const summary = this.summary(id);
      return summary == null ? [] : [summary];
    });
  }

  emitRoster(): void {
    this.#deps.events.emit("agents", this.listSummaries());
  }

  emitUpsert(chatId: string): void {
    const summary = this.summary(chatId);
    if (summary != null) this.#deps.events.emit("agent-upserted", summary);
  }

  #append(chatId: string, entry: NewEntry, fromUser: boolean): StoredEntry {
    const stored = this.transcript(chatId).append(entry);
    const now = this.#now();
    this.#deps.view.markActivity(chatId, now);
    if (fromUser) this.#deps.view.markViewed(chatId, now);
    this.#deps.events.emit("transcript", { type: "appended", agentId: chatId, entry: stored });
    this.emitUpsert(chatId);
    return stored;
  }

  #requireChat(chatId: string): void {
    if (this.chatKind(chatId) == null) throw new ControlError("unknown_chat", `no chat "${chatId}"`);
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }
}
