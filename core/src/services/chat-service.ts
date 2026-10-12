import { hostPaths, type HostConfig } from "../config.ts";
import type { RoomMessage } from "../rooms/index.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import type { HostEvents } from "../host-events.ts";
import { ONBOARDING_ORIGIN } from "../bots/onboarding.ts";
import { botSystemNoticeEntry, type BotSystemEvent } from "../model/bot-system-events.ts";
import { botMessageEntry, noticeEntry, promptEntry, toRoomMessage, toggleReaction, userMessageEntry, type Author } from "../model/entries.ts";
import type { BlockedPrompt } from "../herdr/blocked-prompt.ts";
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
  /** Chats beyond this many most-recently-used keep only their cheap last-entry cache, not the full
   * transcript, so an app that has read many chats does not hold every one of them in memory forever. */
  readonly maxHotTranscripts?: number;
}

export type ChatKind = "bot" | "room";

const DEFAULT_MAX_HOT_TRANSCRIPTS = 8;

export class ChatService {
  readonly #deps: ChatServiceDeps;
  readonly #transcripts = new Map<string, TranscriptStore>();
  /** Chat ids whose full transcript is currently resident in memory, oldest first. Bumped only by an
   * actual full-array touch (TranscriptStore's onFullAccess hook below) -- a cheap last()/nextSeq() call
   * must not count as "use", or scanning every chat's summary() for the roster would evict the chat the
   * user actually has open. */
  readonly #hot: string[] = [];

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
    const index = this.#hot.indexOf(chatId);
    if (index >= 0) this.#hot.splice(index, 1);
  }

  transcript(chatId: string): TranscriptStore {
    const cached = this.#transcripts.get(chatId);
    if (cached != null) return cached;
    const path = isRoomId(chatId) ? hostPaths.roomTranscript(this.#deps.config.home, chatId) : hostPaths.botTranscript(this.#deps.config.home, chatId);
    const store = new TranscriptStore(path, () => this.#touchHot(chatId));
    this.#transcripts.set(chatId, store);
    return store;
  }

  /** Keeps the full in-memory entries array only for the most recently (fully) used chats, releasing
   * the rest back to their cheap last-entry cache. Never affects correctness -- a released store
   * transparently reloads from disk the next time its full history is needed. */
  #touchHot(chatId: string): void {
    const index = this.#hot.indexOf(chatId);
    if (index >= 0) this.#hot.splice(index, 1);
    this.#hot.push(chatId);
    const max = this.#deps.maxHotTranscripts ?? DEFAULT_MAX_HOT_TRANSCRIPTS;
    while (this.#hot.length > max) {
      const evictedId = this.#hot.shift()!;
      this.#transcripts.get(evictedId)?.release();
    }
  }

  appendUser(chatId: string, args: { readonly content: string; readonly clientNonce?: string; readonly richText?: string; readonly replyTo?: string }): StoredEntry {
    this.#requireChat(chatId);
    const entry = userMessageEntry({ ...args, timestampMs: this.#now(), userName: this.#deps.config.userName });
    return this.#append(chatId, entry, true);
  }

  /** `fields`: additive marker fields (A2 `staleFor`, A6 `late`/`lateAfterMs`/`answersHeld`) spread
   * onto the stored entry -- see turn-service.ts handleSay for when each is set. */
  appendBot(chatId: string, author: Author, content: string, fields?: Record<string, unknown>): StoredEntry {
    this.#requireChat(chatId);
    return this.#append(chatId, { ...botMessageEntry({ content, author, timestampMs: this.#now() }), ...fields }, false);
  }

  appendNotice(chatId: string, content: string): StoredEntry {
    this.#requireChat(chatId);
    return this.#append(chatId, noticeEntry({ content, timestampMs: this.#now() }), false);
  }

  /** A bot's blocked approval/question form as an inline card entry (see entries.ts promptEntry). */
  appendPrompt(chatId: string, author: Author, prompt: BlockedPrompt): StoredEntry {
    this.#requireChat(chatId);
    return this.#append(chatId, promptEntry({ author, prompt, timestampMs: this.#now() }), false);
  }

  /**
   * User `message`-kind entries in `chatId` currently marked as held for `botId` (busy-
   * skipped questions this bot has not yet addressed), oldest first. Fed into the bot's next turn
   * prompt so its reply is not context-free; see turn-service.ts `#memberTurn`.
   */
  heldEntriesFor(chatId: string, botId: string): StoredEntry[] {
    if (this.chatKind(chatId) == null) return [];
    return this.transcript(chatId).readAll().filter((entry) => entry.kind === "message" && Array.isArray(entry.heldFor) && (entry.heldFor as unknown[]).includes(botId));
  }

  /** Marks a user entry as held for `botId`: recorded when that bot's turn is busy-skipped. */
  markHeld(chatId: string, entryId: string, botId: string): void {
    this.updateEntry(chatId, entryId, (entry) => {
      const current = Array.isArray(entry.heldFor) ? (entry.heldFor as string[]) : [];
      return current.includes(botId) ? entry : { ...entry, heldFor: [...current, botId] };
    });
  }

  /** Clears a user entry's held-for-`botId` marker once that bot has answered it. */
  clearHeld(chatId: string, entryId: string, botId: string): void {
    this.updateEntry(chatId, entryId, (entry) => {
      const current = Array.isArray(entry.heldFor) ? (entry.heldFor as string[]) : [];
      return current.includes(botId) ? { ...entry, heldFor: current.filter((id) => id !== botId) } : entry;
    });
  }

  /** Rewrites one stored entry in place and publishes it as a transcript "updated" event -- unless the
   * patch left every field the same, in which case TranscriptStore.update() skipped the rewrite and
   * returns the entry unchanged, and there is nothing new to publish either. */
  updateEntry(chatId: string, entryId: string, patch: (entry: StoredEntry) => StoredEntry): StoredEntry | null {
    if (this.chatKind(chatId) == null) return null;
    const before = this.transcript(chatId).get(entryId);
    const updated = this.transcript(chatId).update(entryId, patch);
    if (updated != null && updated !== before) this.#deps.events.emit("transcript", { type: "updated", agentId: chatId, entry: updated });
    return updated;
  }

  /**
   * A structured system notice (bot rename, cross-chat message delivery). Follows the exact
   * same `#append(..., false)` path as `appendNotice`: never counted toward the unread-bot-message
   * badge (only a `send-message` entry is "incoming" -- see the comment in `#append`).
   */
  appendBotEvent(chatId: string, event: BotSystemEvent): StoredEntry {
    this.#requireChat(chatId);
    return this.#append(chatId, botSystemNoticeEntry(event, this.#now()), false);
  }

  /**
   * Stores the bot's own first greeting (a real `send-message`, not a fabricated user bubble),
   * tagged with its onboarding origin/key so it can be recognised on restart and never double-added.
   * Idempotent by key: a repeated say for the same key returns the entry already stored.
   */
  appendOnboardingGreeting(chatId: string, author: Author, content: string, onboardingKey: string): StoredEntry {
    this.#requireChat(chatId);
    const existing = this.findByOnboardingKey(chatId, onboardingKey);
    this.#promoteOnboardingToReady(chatId);
    if (existing != null) return existing;
    const base = botMessageEntry({ content, author, timestampMs: this.#now() });
    return this.#append(chatId, { ...base, origin: ONBOARDING_ORIGIN, onboardingKey }, false);
  }

  #promoteOnboardingToReady(botId: string): void {
    const profile = this.#deps.profiles.get(botId);
    if (profile?.onboarding == null || profile.onboarding.stage === "ready") return;
    this.#deps.profiles.save({ ...profile, onboarding: { ...profile.onboarding, stage: "ready", error: null }, updatedAt: this.#now() });
  }

  /** The greeting entry recorded for this onboarding key, if any (the crash-recovery source of truth). */
  findByOnboardingKey(chatId: string, onboardingKey: string): StoredEntry | null {
    if (this.chatKind(chatId) == null) return null;
    return this.transcript(chatId).readAll().find((entry) => entry.origin === ONBOARDING_ORIGIN && entry.onboardingKey === onboardingKey) ?? null;
  }

  history(chatId: string): RoomMessage[] {
    return this.transcript(chatId).readAll().flatMap((entry) => {
      const message = toRoomMessage(entry);
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
    const before = this.transcript(chatId).get(entryId);
    const updated = this.transcript(chatId).update(entryId, (entry) => toggleReaction(entry, emoji));
    if (updated != null && updated !== before) this.#deps.events.emit("transcript", { type: "updated", agentId: chatId, entry: updated });
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
    // state is now acknowledged only through the renderer's explicit seq-based ACK. Only a
    // bot reply ("send-message") is "incoming" for unread purposes; a notice is neither incoming nor
    // outgoing (mirrors computeMigratedSeqFields, which also only looks at send-message/message).
    //
    // A real message (incoming or outgoing) bumps `lastMessageAt` -- the sidebar's single
    // most-recent-message ordering key -- with a host-assigned activity time strictly greater
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
