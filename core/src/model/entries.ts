import type { GroupMessage } from "../group/group-chat.ts";
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
  return null;
}

export function toGroupMessage(entry: StoredEntry): GroupMessage | null {
  const content = entryText(entry);
  if (content == null || entry.kind === "notice") return null;
  const author = projectAuthor(entry.author);
  if (entry.kind === "message") return { speaker: { kind: "user", ...(author == null ? {} : { name: author.name }) }, content };
  if (author == null) return null;
  return { speaker: { kind: "member", id: author.id, name: author.name }, content };
}

export function lastEntryPreview(entry: StoredEntry | null): { readonly kind: "text"; readonly text: string } | null {
  const text = entry == null ? null : entryText(entry);
  return text == null ? null : { kind: "text", text };
}
