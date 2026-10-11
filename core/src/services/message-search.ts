import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { hostPaths } from "../config.ts";
import { entryText, projectAuthor } from "../model/entries.ts";
import type { StoredEntry } from "../store/transcript-store.ts";

/** The five fields the command palette's message provider
 * (command-palette-message-provider.ts) validates and renders -- field names and types must match
 * it exactly, or every result is silently dropped as malformed. */
export interface MessageSearchHit {
  readonly agentId: string;
  readonly entryId: string;
  readonly role: "user" | "assistant";
  readonly timestampMs: number;
  readonly snippet: string;
  /** Not read by the palette provider above (which only destructures the five fields it validates),
   * but harmless extra data for any future consumer -- the chat's display name and the message's
   * author name, since `agentId` alone doesn't say which room member actually wrote it. */
  readonly chatName: string;
  readonly author: string;
}

const MAX_RESULTS = 50;
const SNIPPET_RADIUS = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEntry(line: string): StoredEntry | null {
  if (line.trim().length === 0) return null;
  try {
    const value: unknown = JSON.parse(line);
    if (!isRecord(value)) return null;
    return typeof value.id === "string" && typeof value.kind === "string" && typeof value.seq === "number" && typeof value.timestampMs === "number"
      ? (value as StoredEntry)
      : null;
  } catch {
    return null; // a corrupt line is skipped, not fatal to the whole search
  }
}

function roleFor(kind: string): "user" | "assistant" | null {
  if (kind === "message") return "user";
  if (kind === "send-message") return "assistant";
  return null; // notices/prompts are not "messages" a user sent or received -- excluded from search
}

/** `matchIndex`/`needle` are computed against `text.toLowerCase()`; slicing the original `text` at the
 * same offsets is safe for Korean (toLowerCase never changes Hangul length) though not guaranteed for
 * every Unicode string in general -- fine for this app's content. */
function sliceSnippet(text: string, matchIndex: number, needleLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, matchIndex + needleLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

/** Code fences (with their language tag), inline-code backticks and bold markers, which the palette
 * would otherwise show verbatim -- its rows are plain text, not rendered markdown. */
function stripMarkdownMarkers(text: string): string {
  return text.replace(/```[\w+-]*/g, " ").replace(/`/g, "").replace(/\*\*|__/g, "");
}

/** The snippet is cut from the marker-free text so the window stays centred on the match; a needle
 * that itself contains a marker (searching for "`foo`") only matches the raw text, so it falls back. */
function buildSnippet(text: string, needle: string, rawMatchIndex: number): string {
  const plain = stripMarkdownMarkers(text);
  const plainIndex = plain.toLowerCase().indexOf(needle);
  return plainIndex >= 0 ? sliceSnippet(plain, plainIndex, needle.length) : sliceSnippet(text, rawMatchIndex, needle.length);
}

interface ChatRef {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

/** The minimal chat identity this module needs -- deliberately not ProfileStore/RoomStore (which
 * would reach past Host's public surface); the dispatcher builds this list from
 * `host.chat.listSummaries()`, which already enumerates every bot and room. */
export interface MessageSearchChat {
  readonly id: string;
  readonly name: string;
  readonly isGroup: boolean;
}

function chatRefs(home: string, chats: readonly MessageSearchChat[]): ChatRef[] {
  return chats.map((chat) => ({
    id: chat.id,
    name: chat.name,
    path: chat.isGroup ? hostPaths.roomTranscript(home, chat.id) : hostPaths.botTranscript(home, chat.id),
  }));
}

/** Streams one chat's transcript line by line (node:readline over a read stream -- never the whole
 * file in memory at once, and never through TranscriptStore/ChatService's resident cache, so a
 * roster-wide search can't make every chat "hot"). Resolves to [] for a missing/unreadable file. */
async function searchChatFile(chat: ChatRef, needle: string): Promise<MessageSearchHit[]> {
  let stream;
  try {
    stream = createReadStream(chat.path, { encoding: "utf8" });
  } catch {
    return [];
  }
  const hits: MessageSearchHit[] = [];
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const entry = parseEntry(line);
      if (entry == null) continue;
      const role = roleFor(entry.kind);
      if (role == null) continue;
      const text = entryText(entry);
      if (text == null) continue;
      const matchIndex = text.toLowerCase().indexOf(needle);
      if (matchIndex < 0) continue;
      const author = projectAuthor(entry.author);
      hits.push({
        agentId: chat.id,
        chatName: chat.name,
        entryId: entry.id,
        role,
        author: author?.name ?? chat.name,
        timestampMs: entry.timestampMs,
        snippet: buildSnippet(text, needle, matchIndex),
      });
    }
  } catch {
    // ENOENT (deleted mid-scan) or a mid-stream read error -- return whatever was collected so far
    // rather than failing the whole roster-wide search over one chat.
  } finally {
    rl.close();
  }
  return hits;
}

/**
 * Case-insensitive substring search over every chat's message bodies (⌘K's message search -- not just
 * bot/room *names*). Korean works the same as ASCII (`String.prototype.toLowerCase`/`includes` are
 * codepoint-aware). Returns at most 50 hits, newest first; a blank query returns none.
 */
export async function searchMessages(home: string, chats: readonly MessageSearchChat[], query: string): Promise<MessageSearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const perChat = await Promise.all(chatRefs(home, chats).map((chat) => searchChatFile(chat, needle)));
  return perChat.flat().sort((a, b) => b.timestampMs - a.timestampMs).slice(0, MAX_RESULTS);
}
