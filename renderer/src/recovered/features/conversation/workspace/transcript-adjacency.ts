import type { TranscriptCardEntry } from "../cards/transcript-card/protocol";
import type { ConversationTranscriptEntry, TranscriptMessage } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5066900 (immutable role bucket)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5067086 (immutable group identity)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5068558 (immutable bubble eligibility)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5073317 (immutable six-field adjacency projector)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6362973 (Windows role bucket)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6363218 (Windows group identity)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6365145 (Windows bubble eligibility)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6371303 (Windows six-field adjacency projector)

export interface TranscriptAdjacency {
  readonly isContinuedFromPrev: boolean;
  readonly isContinuedToNext: boolean;
  readonly isGroupStart: boolean;
  readonly isRunStart: boolean;
  readonly isFollowedByThreadChip: boolean;
  readonly isGroupEnd: boolean;
  /** herdr-bot: true on the last bubble of a same-author, same-time-window run (Slack-style: name
   * on the first bubble, avatar on the last). Unlike `isGroupEnd`, this is meaningful for
   * assistant rows too. */
  readonly isAssistantRunEnd: boolean;
}

export interface TranscriptAdjacencyOptions {
  /** Existing thread-summary owner; no summary state is created here. */
  readonly entryHasThreadChip?: (entry: ConversationTranscriptEntry) => boolean;
  /** The shipped projector receives the preceding row's thread-chip state separately. */
  readonly prevHasThreadChip?: (entry: ConversationTranscriptEntry) => boolean;
  /** Defaults to the immutable indicator-seaming behavior. */
  readonly isIndicatorSeamingBubble?: boolean;
}

const EMPTY_ADJACENCY: TranscriptAdjacency = Object.freeze({
  isContinuedFromPrev: false,
  isContinuedToNext: false,
  isGroupStart: false,
  isRunStart: false,
  isFollowedByThreadChip: false,
  isGroupEnd: false,
  isAssistantRunEnd: false,
});

type TranscriptRole = "assistant" | "user" | "other";

interface TranscriptSemantics {
  readonly role: TranscriptRole;
  readonly groupKey: string | null;
  readonly isBubble: boolean;
  readonly hasReaction: boolean;
}

type ProjectedUserAttachmentMessage = TranscriptMessage & { readonly sourceKind?: unknown };

function isUserAttachment(entry: TranscriptMessage): boolean {
  return (entry as ProjectedUserAttachmentMessage).sourceKind === "user-attachment";
}

function isStandaloneEmoji(value: string): boolean {
  const text = value.trim();
  if (text.length === 0) return false;
  try {
    return new RegExp("^\\p{RGI_Emoji}$", "v").test(text);
  } catch {
    return false;
  }
}

function isImageOnlyMarkdown(value: string): boolean {
  const remainder = value.replace(/!\[[^\]]*\]\([^)]*\)/gu, "").trim();
  return value.trim().length > 0 && remainder.length === 0;
}

function messageSemantics(entry: TranscriptMessage): TranscriptSemantics {
  const userAttachment = isUserAttachment(entry);
  const role: TranscriptRole = userAttachment ? "user" : entry.role;
  const groupKey = userAttachment ? "user" : `${role}:${entry.author}`;
  const hasReaction = Array.isArray(entry.reactions) && entry.reactions.length > 0;
  const isBubble = !userAttachment
    && (entry.attachments?.length ?? 0) === 0
    && entry.text.trim().length > 0
    && !isImageOnlyMarkdown(entry.text)
    && !(role === "user" && isStandaloneEmoji(entry.text))
    && entry.sendMessageText?.presentation.kind !== "url-card";
  return { role, groupKey, isBubble, hasReaction };
}

function entrySemantics(entry: ConversationTranscriptEntry): TranscriptSemantics {
  if (entry.kind === "message") return messageSemantics(entry);
  if (entry.kind === "send-message") {
    const hasReaction = Array.isArray(entry.reactions) && entry.reactions.length > 0;
    // herdr-bot: the shipped protocol carried no author identity for send-message cards. Ours
    // does (room messages carry the sending bot's id/name), so group consecutive bubbles by
    // author, not by role alone -- otherwise two different bots posting back to back in a room
    // look like one uninterrupted run.
    const groupKey = entry.author != null ? `assistant:${entry.author.id}` : "assistant";
    return { role: "assistant", groupKey, isBubble: false, hasReaction };
  }
  return { role: "other", groupKey: null, isBubble: false, hasReaction: false };
}

function safeThreadChip(options: TranscriptAdjacencyOptions, entry: ConversationTranscriptEntry | undefined, previous = false): boolean {
  if (entry == null) return false;
  const resolver = previous ? options.prevHasThreadChip ?? options.entryHasThreadChip : options.entryHasThreadChip;
  if (resolver == null) return false;
  try {
    return resolver(entry) === true;
  } catch {
    return false;
  }
}

/**
 * Computes the immutable six-field row boundary over the currently loaded
 * transcript window. Unsupported rows intentionally become an all-false
 * boundary and never borrow identity from adjacent message-like entries.
 */
/** herdr-bot: a same-author run breaks after this much silence, Slack-style, even with no other
 * boundary -- otherwise a bot's messages sent hours apart would still read as one uninterrupted
 * group. */
const RUN_TIME_WINDOW_MS = 5 * 60 * 1000;

function entryTimestampMs(entry: ConversationTranscriptEntry | undefined): number | undefined {
  const value = (entry as { timestampMs?: unknown } | undefined)?.timestampMs;
  return typeof value === "number" ? value : undefined;
}

function tooFarApart(a: ConversationTranscriptEntry | undefined, b: ConversationTranscriptEntry | undefined): boolean {
  const first = entryTimestampMs(a);
  const second = entryTimestampMs(b);
  return first == null || second == null || Math.abs(second - first) > RUN_TIME_WINDOW_MS;
}

export function projectTranscriptAdjacency(
  entries: readonly ConversationTranscriptEntry[],
  options: TranscriptAdjacencyOptions = {},
): readonly TranscriptAdjacency[] {
  const indicatorSeamingBubble = options.isIndicatorSeamingBubble ?? true;
  return entries.map((entry, index) => {
    const current = entrySemantics(entry);
    if (current.role === "other" || current.groupKey == null) return EMPTY_ADJACENCY;

    const previousEntry = entries[index - 1];
    const nextEntry = entries[index + 1];
    const previous = previousEntry == null ? null : entrySemantics(previousEntry);
    const next = nextEntry == null ? null : entrySemantics(nextEntry);
    const entryHasThreadChip = safeThreadChip(options, entry);
    const prevHasThreadChip = safeThreadChip(options, previousEntry, true);
    const isIndicatorSeaming = indicatorSeamingBubble
      && current.role === "assistant"
      && !entryHasThreadChip
      && !current.hasReaction;
    const isAssistantGroup = current.role === "assistant";
    const sameGroupAsPrev = previous?.groupKey === current.groupKey && !tooFarApart(previousEntry, entry);
    const sameGroupAsNext = next?.groupKey === current.groupKey && !tooFarApart(entry, nextEntry);

    return {
      isContinuedFromPrev: current.isBubble
        && sameGroupAsPrev
        && previous!.isBubble
        && !prevHasThreadChip,
      isContinuedToNext: current.isBubble
        && ((sameGroupAsNext && next!.isBubble) || isIndicatorSeaming),
      isGroupStart: previousEntry !== undefined && !sameGroupAsPrev,
      isRunStart: previousEntry === undefined || !sameGroupAsPrev,
      isFollowedByThreadChip: current.isBubble && entryHasThreadChip && !current.hasReaction,
      isGroupEnd: !isAssistantGroup && (nextEntry === undefined || !sameGroupAsNext),
      isAssistantRunEnd: isAssistantGroup && (nextEntry === undefined || !sameGroupAsNext),
    };
  });
}

export function transcriptAdjacencyForEntry(
  entries: readonly ConversationTranscriptEntry[],
  index: number,
  options: TranscriptAdjacencyOptions = {},
): TranscriptAdjacency {
  return projectTranscriptAdjacency(entries, options)[index] ?? EMPTY_ADJACENCY;
}

export function emptyTranscriptAdjacency(): TranscriptAdjacency {
  return EMPTY_ADJACENCY;
}

export type TranscriptAdjacencyEntry = TranscriptMessage | TranscriptCardEntry;
