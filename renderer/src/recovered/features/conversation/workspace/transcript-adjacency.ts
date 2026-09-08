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
    // The current card protocol has no author identity. The immutable owner
    // falls back to the assistant group when that identity is absent.
    return { role: "assistant", groupKey: "assistant", isBubble: false, hasReaction };
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

    return {
      isContinuedFromPrev: current.isBubble
        && previous?.groupKey === current.groupKey
        && previous.isBubble
        && !prevHasThreadChip,
      isContinuedToNext: current.isBubble
        && ((next?.groupKey === current.groupKey && next.isBubble) || isIndicatorSeaming),
      isGroupStart: previousEntry !== undefined && previous?.groupKey !== current.groupKey,
      isRunStart: previousEntry === undefined || previous?.groupKey !== current.groupKey,
      isFollowedByThreadChip: current.isBubble && entryHasThreadChip && !current.hasReaction,
      isGroupEnd: !isAssistantGroup && (nextEntry === undefined || next?.groupKey !== current.groupKey),
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
