/** Handlers for chat.*, transcript.*, and message.* -- chat list/profile/read-state, transcript paging,
 * sending/reacting to messages, and message search. */
import type { Host } from "../../host.ts";
import { searchMessages } from "../../services/message-search.ts";
import { AppApiError } from "../errors.ts";
import { toChatSummary, toTranscriptEntry } from "../mapping.ts";
import type { ChatSummary, MessageSearchHit, TranscriptEntry, TranscriptPage } from "../types.ts";
import { bool, num, optNum, optStr, record, str, strArray } from "../validate.ts";

function requireChatSummary(host: Host, chatId: string): ChatSummary {
  const summary = host.chat.summary(chatId);
  if (summary == null) throw new AppApiError("unknown_chat", `no chat "${chatId}"`);
  return toChatSummary(summary);
}

export function listChats(host: Host): ChatSummary[] {
  return host.chat.listSummaries().map(toChatSummary);
}

export function searchChats(host: Host, raw: unknown): ChatSummary[] {
  const params = record(raw);
  const query = (optStr(params, "query") ?? "").toLowerCase();
  return host.chat.listSummaries()
    .filter((summary) => summary.name.toLowerCase().includes(query) || summary.description.toLowerCase().includes(query))
    .map(toChatSummary);
}

export function updateChatProfile(host: Host, raw: unknown): ChatSummary | null {
  const params = record(raw);
  const chatId = str(params, "chatId");
  const patch = {
    ...(optStr(params, "name") == null ? {} : { name: optStr(params, "name")! }),
    ...(typeof params.description === "string" ? { description: params.description } : {}),
    ...(typeof params.title === "string" ? { title: params.title } : {}),
    ...("avatarShape" in params ? { avatarShape: params.avatarShape === "" ? null : (params.avatarShape as string | null) } : {}),
    ...("avatarColor" in params ? { avatarColor: params.avatarColor === "" ? null : (params.avatarColor as string | null) } : {}),
  };
  const isRoom = host.chat.chatKind(chatId) === "room";
  const updated = isRoom ? host.roster.updateRoom(chatId, patch) : host.roster.updateProfile(chatId, patch);
  // A room update has no upsert side effect of its own; a bot profile update already emits one itself
  // (RosterService.updateProfile), so only the room branch needs an explicit emit here.
  if (isRoom && updated != null) host.chat.emitUpsert(chatId);
  if (updated == null) return null;
  const summary = host.chat.summary(chatId);
  return summary == null ? null : toChatSummary(summary);
}

export function setChatUnread(host: Host, raw: unknown): void {
  const params = record(raw);
  host.chat.setUnread(str(params, "chatId"), bool(params, "isUnread"));
}

export function markChatRead(host: Host, raw: unknown): { readonly lastReadSeq: number } {
  const params = record(raw);
  const chatId = str(params, "chatId");
  requireChatSummary(host, chatId);
  const throughSeq = params.throughSeq;
  if (typeof throughSeq !== "number" || !Number.isInteger(throughSeq) || throughSeq < 0) {
    throw new AppApiError("invalid_args", "throughSeq must be a non-negative integer");
  }
  return host.chat.markRead(chatId, throughSeq);
}

export function setChatHidden(host: Host, raw: unknown): void {
  const params = record(raw);
  const chatId = str(params, "chatId");
  const hidden = bool(params, "isHidden");
  if (host.chat.chatKind(chatId) === "room") {
    host.roster.updateRoom(chatId, { isHiddenFromSidebar: hidden });
    host.chat.emitUpsert(chatId);
  } else {
    host.roster.updateProfile(chatId, { isHiddenFromSidebar: hidden });
  }
}

export function setChatNotifyOnUpdates(host: Host, raw: unknown): ChatSummary | null {
  const params = record(raw);
  const chatId = str(params, "chatId");
  host.roster.updateProfile(chatId, { notifyOnUpdatesEnabled: bool(params, "isEnabled") });
  const summary = host.chat.summary(chatId);
  return summary == null ? null : toChatSummary(summary);
}

export async function deleteChats(host: Host, raw: unknown): Promise<{ readonly deletedIds: readonly string[] }> {
  const params = record(raw);
  const chatIds = strArray(params, "chatIds");
  for (const id of chatIds) {
    if (host.chat.chatKind(id) === "room") host.roster.deleteRoom(id);
    else if (host.chat.chatKind(id) === "bot") await host.roster.deleteBot(id);
  }
  host.chat.emitRoster();
  return { deletedIds: chatIds };
}

export function transcriptPage(host: Host, raw: unknown): TranscriptPage {
  const params = record(raw);
  const chatId = str(params, "chatId");
  requireChatSummary(host, chatId);
  // Read-only: paging a transcript never marks it read -- `chat.markRead` is the only acknowledgement.
  const page = host.chat.tail(chatId, num(params, "limit", 200), optNum(params, "beforeSeq"));
  return { entries: page.entries.map(toTranscriptEntry), ...(page.nextBeforeSeq == null ? {} : { nextBeforeSeq: page.nextBeforeSeq }) };
}

export function transcriptThread(host: Host, raw: unknown): { readonly entries: readonly TranscriptEntry[] } {
  const params = record(raw);
  return { entries: host.chat.thread(str(params, "chatId"), str(params, "rootId")).map(toTranscriptEntry) };
}

export function sendMessage(host: Host, raw: unknown): { readonly entryId: string } {
  const params = record(raw);
  const chatId = str(params, "chatId");
  requireChatSummary(host, chatId);
  const entry = host.sendUserMessage(chatId, {
    content: typeof params.text === "string" ? params.text : "",
    ...(optStr(params, "clientNonce") == null ? {} : { clientNonce: optStr(params, "clientNonce")! }),
    ...(optStr(params, "richText") == null ? {} : { richText: optStr(params, "richText")! }),
    ...(optStr(params, "replyTo") == null ? {} : { replyTo: optStr(params, "replyTo")! }),
    ...(Array.isArray(params.attachmentPaths) ? { attachmentPaths: params.attachmentPaths.filter((p): p is string => typeof p === "string") } : {}),
  });
  return { entryId: entry.id };
}

export function reactToMessage(host: Host, raw: unknown): { readonly entry: TranscriptEntry | null } {
  const params = record(raw);
  const entry = host.chat.react(str(params, "chatId"), str(params, "entryId"), str(params, "emoji"));
  return { entry: entry == null ? null : toTranscriptEntry(entry) };
}

export async function searchMessagesHandler(host: Host, raw: unknown): Promise<readonly MessageSearchHit[]> {
  const params = record(raw);
  const chats = host.chat.listSummaries().map((summary) => ({ id: summary.id, name: summary.name, isGroup: summary.isGroup }));
  const hits = await searchMessages(host.config.home, chats, optStr(params, "query") ?? "");
  return hits.map((hit) => ({ chatId: hit.agentId, chatName: hit.chatName, entryId: hit.entryId, role: hit.role, author: hit.author, timestampMs: hit.timestampMs, snippet: hit.snippet }));
}
