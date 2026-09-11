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

  /** Drops the cached transcript store for a deleted chat so a reused chatId does not resurrect stale entries. */
  forget(chatId: string): void {
    this.#transcripts.delete(chatId);
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

  /** Seq-based read acknowledgement (RPC `herdrBot.markChatRead`). Clamped to the transcript's actual latest seq. */
  markRead(chatId: string, throughSeq: number): { readonly lastReadSeq: number } {
    this.#requireChat(chatId);
    this.#ensureMigrated(chatId);
    const latestSeq = this.transcript(chatId).last()?.seq ?? 0;
    const updated = this.#deps.view.applyRead(chatId, throughSeq, latestSeq, this.#now());
    this.emitUpsert(chatId);
    return { lastReadSeq: updated.lastReadSeq };
  }

  /** `isUnread: false` acknowledges everything through the chat's current latest seq (an explicit "mark read"). */
  setUnread(chatId: string, isUnread: boolean): void {
    this.#requireChat(chatId);
    this.#ensureMigrated(chatId);
    if (isUnread) {
      this.#deps.view.setManuallyUnread(chatId, true);
    } else {
      const latestSeq = this.transcript(chatId).last()?.seq ?? 0;
      this.#deps.view.applyRead(chatId, latestSeq, latestSeq, this.#now());
    }
    this.emitUpsert(chatId);
  }

  summary(chatId: string): AgentSummary | null {
    this.#ensureMigrated(chatId);
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
    this.#ensureMigrated(chatId);
    const stored = this.transcript(chatId).append(entry);
    const now = this.#now();
    // Sending a message no longer implies the sender has read every prior incoming message -- read
    // state is now acknowledged only through the renderer's explicit seq-based ACK (Task 2). Only a
    // bot reply ("send-message") is "incoming" for unread purposes; a notice is neither incoming nor
    // outgoing (mirrors computeMigratedSeqFields, which also only looks at send-message/message).
    //
    // A real message (incoming or outgoing) bumps `lastMessageAt` -- the sidebar's single
    // most-recent-message ordering key (Task 3) -- with a host-assigned activity time strictly greater
    // than the current global max across every chat, so two chats that receive a message within the
    // same millisecond still sort deterministically instead of tying. A notice is neither, so it only
    // ever bumps `lastActivityAt` via recordActivity, never `lastMessageAt`.
    if (fromUser) this.#deps.view.recordOutgoing(chatId, this.#messageActivityAt(now));
    else if (stored.kind === "send-message") this.#deps.view.recordIncoming(chatId, stored.seq, this.#messageActivityAt(now));
    else this.#deps.view.recordActivity(chatId, now);
    this.#deps.events.emit("transcript", { type: "appended", agentId: chatId, entry: stored });
    this.emitUpsert(chatId);
    return stored;
  }

  /** At least one greater than the current `lastMessageAt` max across every chat, so a new message's
   * sort key is always strictly ahead of everything already known -- even one received in the same ms. */
  #messageActivityAt(now: number): number {
    const ids = [...this.#deps.profiles.list().map((profile) => profile.id), ...this.#deps.rooms.list().map((room) => room.id)];
    const maxLastMessageAt = ids.reduce((max, id) => Math.max(max, this.#deps.view.get(id).lastMessageAt), 0);
    return Math.max(now, maxLastMessageAt + 1);
  }

  #requireChat(chatId: string): void {
    if (this.chatKind(chatId) == null) throw new ControlError("unknown_chat", `no chat "${chatId}"`);
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }

  /**
   * Backfills seq fields for a chat whose view-state entry predates seq-based read tracking.
   * `lastReadSeq` is the highest seq whose entry timestamp falls at/before the old `lastViewedAt`
   * watermark; `lastIncomingSeq` is the last bot ("send-message") entry's seq; `lastMessageAt` is the
   * timestamp of the last message/send-message entry. An empty transcript migrates to all zeros.
   */
  #ensureMigrated(chatId: string): void {
    if (this.#deps.view.hasSeqFields(chatId) || this.chatKind(chatId) == null) return;
    const view = this.#deps.view.get(chatId);
    const entries = this.transcript(chatId).readAll();
    const computed = computeMigratedSeqFields(entries, view.lastViewedAt);
    this.#deps.view.migrateSeqFields(chatId, computed);
  }
}

function computeMigratedSeqFields(entries: readonly StoredEntry[], lastViewedAt: number): { lastReadSeq: number; lastIncomingSeq: number; lastMessageAt: number } {
  let lastReadSeq = 0;
  let lastIncomingSeq = 0;
  let lastMessageAt = 0;
  for (const entry of entries) {
    if (entry.timestampMs <= lastViewedAt) lastReadSeq = Math.max(lastReadSeq, entry.seq);
    if (entry.kind === "send-message") lastIncomingSeq = entry.seq;
    if (entry.kind === "message" || entry.kind === "send-message") lastMessageAt = entry.timestampMs;
  }
  return { lastReadSeq, lastIncomingSeq, lastMessageAt };
}
