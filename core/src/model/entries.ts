import type { GroupMessage } from "../group/group-chat.ts";
import type { BlockedPrompt } from "../herdr/blocked-prompt.ts";
import type { NewEntry, StoredEntry } from "../store/transcript-store.ts";

export interface Author {
  readonly id: string;
  readonly name: string;
}

export interface Reaction {
  readonly emoji: string;
  readonly by: string;
}

export const USER_AUTHOR_ID = "user";
export const REACTION_SELF = "me";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function projectAuthor(value: unknown): Author | null {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" ? { id: value.id, name: value.name } : null;
}

export function userMessageEntry(args: {
  readonly content: string;
  readonly timestampMs: number;
  readonly userName: string;
  readonly clientNonce?: string;
  readonly richText?: string;
  readonly replyTo?: string;
}): NewEntry {
  return {
    kind: "message",
    role: "user",
    content: args.content,
    isStreaming: false,
    timestampMs: args.timestampMs,
    author: { id: USER_AUTHOR_ID, name: args.userName },
    ...(args.clientNonce == null ? {} : { clientNonce: args.clientNonce }),
    ...(args.richText == null || args.richText.length === 0 ? {} : { richText: args.richText }),
    ...(args.replyTo == null ? {} : { replyTo: args.replyTo }),
  };
}

export function botMessageEntry(args: { readonly content: string; readonly author: Author; readonly timestampMs: number }): NewEntry {
  return { kind: "send-message", message: { type: "text", content: args.content }, author: args.author, timestampMs: args.timestampMs };
}

export function noticeEntry(args: { readonly content: string; readonly timestampMs: number }): NewEntry {
  return { kind: "notice", content: args.content, timestampMs: args.timestampMs };
}

/** `superseded`: a ghost an earlier run stacked above a later card for the very same form (see
 * PromptTracker.recover); the renderer drops it instead of showing a second, dead copy. */
export type PromptEntryStatus = "pending" | "answered" | "resolved" | "superseded";

export type PromptEntryAnswer =
  | { readonly kind: "option"; readonly key: string; readonly label: string }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "cancelled" };

/**
 * A bot's approval/question form, stored in the chat whose turn raised it so it renders inline as a
 * card (renderer PendingPromptCard). `pending` while the pane is still blocked on it; `answered` once
 * the user picked from the card (`answer` says what); `resolved` when the pane moved on without an
 * in-app answer (answered in herdr, or the form changed).
 */
export function promptEntry(args: { readonly author: Author; readonly prompt: BlockedPrompt; readonly timestampMs: number }): NewEntry {
  return { kind: "prompt", author: args.author, prompt: args.prompt, status: "pending" satisfies PromptEntryStatus, timestampMs: args.timestampMs };
}

function projectReactions(value: unknown): Reaction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isRecord(item) && typeof item.emoji === "string" && typeof item.by === "string" ? [{ emoji: item.emoji, by: item.by }] : []));
}

export function toggleReaction(entry: StoredEntry, emoji: string, by: string = REACTION_SELF): StoredEntry {
  const current = projectReactions(entry.reactions);
  const matches = (reaction: Reaction): boolean => reaction.emoji === emoji && reaction.by === by;
  const reactions = current.some(matches) ? current.filter((reaction) => !matches(reaction)) : [...current, { emoji, by }];
  return { ...entry, reactions };
}

export function entryText(entry: StoredEntry): string | null {
  if ((entry.kind === "message" || entry.kind === "notice") && typeof entry.content === "string") return entry.content;
  if (entry.kind === "send-message" && isRecord(entry.message) && entry.message.type === "text" && typeof entry.message.content === "string") return entry.message.content;
  if (entry.kind === "prompt" && isRecord(entry.prompt) && typeof entry.prompt.question === "string") return entry.prompt.question;
  return null;
}

export function toGroupMessage(entry: StoredEntry): GroupMessage | null {
  const content = entryText(entry);
  if (content == null || entry.kind === "notice" || entry.kind === "prompt") return null;
  const author = projectAuthor(entry.author);
  if (entry.kind === "message") return { speaker: { kind: "user", ...(author == null ? {} : { name: author.name }) }, content };
  if (author == null) return null;
  return { speaker: { kind: "member", id: author.id, name: author.name }, content };
}

export function lastEntryPreview(entry: StoredEntry | null): { readonly kind: "text"; readonly text: string } | null {
  const text = entry == null ? null : entryText(entry);
  return text == null ? null : { kind: "text", text };
}
