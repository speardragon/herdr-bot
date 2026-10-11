/** Projects core/host domain objects onto the app-api's dependency-free wire types (types.ts). Server-
 * side only: this file imports from core/src/model and core/src/herdr, so it is never bundled by a UI. */
import type { BlockedPrompt } from "../herdr/blocked-prompt.ts";
import type { HerdrAgentInfo } from "../herdr/types.ts";
import { isRoomId } from "../model/ids.ts";
import type { AgentSummary } from "../model/summaries.ts";
import type { AdoptableAgent, BotFacts, ChatSummary, PendingPrompt, TranscriptEntry } from "./types.ts";

function toPendingPrompt(prompt: BlockedPrompt | null): PendingPrompt | null {
  if (prompt == null) return null;
  return {
    kind: prompt.kind,
    title: prompt.title,
    header: prompt.header,
    progress: prompt.progress,
    question: prompt.question,
    body: prompt.body,
    options: prompt.options,
    multiSelect: prompt.multiSelect,
    freeTextKey: prompt.freeTextKey,
    signature: prompt.signature,
  };
}

function toBotFacts(summary: AgentSummary): BotFacts | null {
  if (summary.herdrBot == null) return null;
  const bot = summary.herdrBot;
  return {
    provider: bot.kind,
    status: bot.status as BotFacts["status"],
    paneId: bot.paneId,
    cwd: bot.cwd,
    adopted: bot.adopted,
    permissionMode: bot.permissionMode as BotFacts["permissionMode"],
    model: bot.model,
    reasoningEffort: bot.reasoningEffort,
    onboarding: bot.onboarding,
    pendingPrompt: toPendingPrompt(bot.prompt),
  };
}

export function toChatSummary(summary: AgentSummary): ChatSummary {
  return {
    id: summary.id,
    kind: isRoomId(summary.id) ? "room" : "bot",
    name: summary.name,
    description: summary.description,
    title: summary.title,
    avatarShape: summary.avatarShape,
    avatarColor: summary.avatarColor,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    isRunning: summary.isRunning,
    currentActivity: summary.currentActivity,
    lastMessagePreview: summary.lastMessagePreview,
    lastMessageId: summary.lastMessageId,
    hasUnread: summary.hasUnread,
    unreadCount: summary.unreadCount,
    lastViewedAt: summary.lastViewedAt,
    lastActivityAt: summary.lastActivityAt,
    lastReadSeq: summary.lastReadSeq,
    lastIncomingSeq: summary.lastIncomingSeq,
    lastMessageAt: summary.lastMessageAt,
    awaitingUserResponse: summary.awaitingUserResponse,
    notifyOnUpdatesEnabled: summary.notifyOnUpdatesEnabled,
    isHiddenFromSidebar: summary.isHiddenFromSidebar,
    isGroup: summary.isGroup,
    memberIds: summary.memberIds,
    bot: toBotFacts(summary),
  };
}

export function toAdoptableAgent(info: HerdrAgentInfo): AdoptableAgent {
  return { name: info.name, provider: info.agent, status: info.agent_status, paneId: info.pane_id, cwd: info.cwd };
}

/** `StoredEntry` is already shaped exactly like `TranscriptEntry` (open id/kind/seq/timestampMs record)
 * -- this is a type-level relabeling, not a transform, kept as a function so call sites read the intent. */
export function toTranscriptEntry(entry: { readonly id: string; readonly kind: string; readonly seq: number; readonly timestampMs: number; readonly [key: string]: unknown }): TranscriptEntry {
  return entry;
}
