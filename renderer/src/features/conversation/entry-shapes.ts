/**
 * Safe, typed accessors over the open-ended `TranscriptEntry` (`{id,kind,seq,timestampMs,...rest}` --
 * see core/src/app-api/types.ts and docs/app-api.md's "Transcript" table). Every field beyond the common
 * four is `unknown` at the type level even though the host always writes one of a handful of shapes per
 * `kind` -- this module is the one place that trusts/validates those shapes so every component downstream
 * can work with plain, narrow types instead of re-guarding `entry.foo as whatever` everywhere.
 *
 * Pure, DOM-free -- unit tested directly with `node --test` (see renderer/test/conversation-entry-shapes.test.ts).
 */
import type { PendingPrompt, TranscriptEntry } from "../../data/types.ts";
import type { BotSystemEvent } from "./bot-system-event.ts";

export interface EntryAuthor {
  readonly id: string;
  readonly name: string;
}

export interface EntryReaction {
  readonly emoji: string;
  readonly by: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function isUserMessage(entry: TranscriptEntry): boolean {
  return entry.kind === "message";
}

export function isBotMessage(entry: TranscriptEntry): boolean {
  return entry.kind === "send-message";
}

export function isNotice(entry: TranscriptEntry): boolean {
  return entry.kind === "notice";
}

export function isPromptEntry(entry: TranscriptEntry): boolean {
  return entry.kind === "prompt";
}

/** Any entry kind this renders as a chat bubble (user or bot) -- everything else (notice, prompt,
 * and any future/unknown kind) gets its own row type instead. */
export function isRenderableMessage(entry: TranscriptEntry): boolean {
  return isUserMessage(entry) || isBotMessage(entry);
}

export function getAuthor(entry: TranscriptEntry): EntryAuthor | null {
  const value = entry.author;
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" ? { id: value.id, name: value.name } : null;
}

/** The raw, unprocessed text of a message/notice entry -- for a `send-message`, drills into
 * `message.content` (`message.type` is always `"text"` today, see docs/app-api.md). `null` for a kind
 * this helper doesn't know how to extract text from (prompt's text lives on `.prompt.question`, use
 * `getPrompt` for that). */
export function getRawText(entry: TranscriptEntry): string | null {
  if (isUserMessage(entry) || isNotice(entry)) return asString(entry.content);
  if (isBotMessage(entry)) {
    const message = entry.message;
    if (isRecord(message) && message.type === "text") return asString(message.content);
    return null;
  }
  return null;
}

export function getReactions(entry: TranscriptEntry): readonly EntryReaction[] {
  const value = entry.reactions;
  if (!Array.isArray(value)) return [];
  const result: EntryReaction[] = [];
  for (const item of value) {
    if (isRecord(item) && typeof item.emoji === "string" && typeof item.by === "string") result.push({ emoji: item.emoji, by: item.by });
  }
  return result;
}

/** The host's constant for "the current user" in a `Reaction.by` (see core/src/model/entries.ts's
 * `REACTION_SELF`) -- duplicated here rather than imported since core/src is off-limits to import at
 * runtime from a renderer-safe module (types.ts is the only cross-package import point). */
export const REACTION_SELF = "me";

export function isMyReaction(reaction: EntryReaction): boolean {
  return reaction.by === REACTION_SELF;
}

export interface ReactionGroup {
  readonly emoji: string;
  readonly count: number;
  readonly mine: boolean;
}

/** Groups raw `{emoji,by}` reaction rows into one pill per distinct emoji (emoji + count,
 * mine highlighted), preserving first-seen order. */
export function groupReactions(reactions: readonly EntryReaction[]): ReactionGroup[] {
  const order: string[] = [];
  const counts = new Map<string, { count: number; mine: boolean }>();
  for (const reaction of reactions) {
    const existing = counts.get(reaction.emoji);
    if (existing == null) {
      order.push(reaction.emoji);
      counts.set(reaction.emoji, { count: 1, mine: isMyReaction(reaction) });
    } else {
      existing.count += 1;
      existing.mine = existing.mine || isMyReaction(reaction);
    }
  }
  return order.map((emoji) => ({ emoji, ...counts.get(emoji)! }));
}

export function getReplyTo(entry: TranscriptEntry): string | null {
  return asString(entry.replyTo);
}

/** The composer's Tiptap `richText` JSON (user messages only -- a bot's `send-message` has no such
 * field). `null` when absent means "no mentions in this
 * message" -- the plain `content`/`text` field is always the source of truth then. See `rich-text.ts`. */
export function getRichText(entry: TranscriptEntry): string | null {
  return isUserMessage(entry) ? asString(entry.richText) : null;
}

/** Bot ids still waiting to answer this (the user's own) message -- the "`<name>` pending" held badge. */
export function getHeldFor(entry: TranscriptEntry): readonly string[] {
  const value = entry.heldFor;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export interface LateInfo {
  readonly late: boolean;
  readonly lateAfterMs: number | null;
}

export function getLateInfo(entry: TranscriptEntry): LateInfo {
  const late = entry.late === true;
  const lateAfterMs = typeof entry.lateAfterMs === "number" ? entry.lateAfterMs : null;
  return { late, lateAfterMs };
}

/** The earlier user entry id this bot reply answers "late"/out of order (answers a question
 * held earlier). */
export function getAnswersHeld(entry: TranscriptEntry): string | null {
  return asString(entry.answersHeld);
}

/** The newer user entry id that superseded the one this bot reply was actually answering (based on
 * an earlier instruction). */
export function getStaleFor(entry: TranscriptEntry): string | null {
  return asString(entry.staleFor);
}

export function getNoticeEvent(entry: TranscriptEntry): BotSystemEvent | null {
  const value = entry.event;
  if (!isRecord(value)) return null;
  if (value.type === "bot-renamed" && typeof value.oldName === "string" && typeof value.newName === "string") {
    return { type: "bot-renamed", oldName: value.oldName, newName: value.newName };
  }
  if (value.type === "bot-message-sent" && typeof value.targetChatId === "string" && typeof value.targetName === "string" && (value.targetKind === "bot" || value.targetKind === "room")) {
    return { type: "bot-message-sent", targetChatId: value.targetChatId, targetName: value.targetName, targetKind: value.targetKind };
  }
  return null;
}

/** Validates+narrows a `prompt` entry's `.prompt` field (`PendingPrompt`, see core/src/herdr/blocked-prompt.ts
 * mirrored in core/src/app-api/types.ts). Minimal validation (just the fields every consumer dereferences)
 * since this is host-authored data, not untrusted user input. */
export function getPrompt(entry: TranscriptEntry): PendingPrompt | null {
  const value = entry.prompt;
  if (!isRecord(value)) return null;
  if (typeof value.question !== "string" || !Array.isArray(value.options) || typeof value.signature !== "string") return null;
  return value as unknown as PendingPrompt;
}

export type PromptEntryStatus = "pending" | "answered" | "resolved" | "superseded";

export function getPromptStatus(entry: TranscriptEntry): PromptEntryStatus | null {
  const value = entry.status;
  return value === "pending" || value === "answered" || value === "resolved" || value === "superseded" ? value : null;
}

export type PromptEntryAnswer = { readonly kind: "option"; readonly key: string; readonly label: string } | { readonly kind: "text"; readonly text: string } | { readonly kind: "cancelled" };

export function getPromptAnswer(entry: TranscriptEntry): PromptEntryAnswer | null {
  const value = entry.answer;
  if (!isRecord(value)) return null;
  if (value.kind === "option" && typeof value.key === "string" && typeof value.label === "string") return { kind: "option", key: value.key, label: value.label };
  if (value.kind === "text" && typeof value.text === "string") return { kind: "text", text: value.text };
  if (value.kind === "cancelled") return { kind: "cancelled" };
  return null;
}
