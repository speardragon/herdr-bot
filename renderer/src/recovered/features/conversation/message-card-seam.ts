import { normalizeLinkUrl, type LinkMetadataResource, type UrlCardProvider } from "./cards/transcript-card/url-card";
import type { TranscriptMessage } from "./workspace/model";

// @evidence src/app/dist/renderer/assets/view-CMppcJ9s.js#L1 (message-card branch projector)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5059259 (bare-link normalization)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=124221 (user/assistant/special guards)

export interface MessageCardImage {
  readonly url: string;
  readonly alt?: string;
}

export interface MessageCardAdjacency {
  readonly isContinuedFromPrev: boolean;
  readonly isContinuedToNext: boolean;
  readonly isGroupStart: boolean;
  readonly isRunStart: boolean;
  readonly isFollowedByThreadChip: boolean;
  readonly isGroupEnd: boolean;
}

export interface MessageCardEntry {
  readonly kind: "message";
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestampMs?: number;
  readonly isStreaming?: boolean;
  readonly images?: readonly MessageCardImage[];
  readonly fromUser?: unknown;
  readonly fromAgent?: unknown;
  readonly toAgent?: unknown;
  readonly channel?: string | null;
  readonly richText?: string;
}

export type MessageCardUnsupportedReason = "invalid-entry" | "special-variant" | "unknown-role";

export interface UnsupportedMessageCard {
  readonly kind: "unsupported";
  readonly reason: MessageCardUnsupportedReason;
}

export interface SupportedMessageCard {
  readonly kind: "message";
  readonly variant: "user" | "assistant";
  readonly id: string;
  readonly content: string;
  readonly images: readonly MessageCardImage[];
  readonly timestampMs?: number;
  readonly isStreaming: boolean;
  readonly isSourceTrusted: boolean;
  readonly isStandaloneEmoji: boolean;
  readonly isFromUser: boolean;
  readonly adjacency: MessageCardAdjacency;
  /** Only ordinary user messages can delegate to the URL-card provider. */
  readonly url: string | null;
}

export type MessageCardProjection = SupportedMessageCard | UnsupportedMessageCard;

export interface MessageCardClipboard {
  writeText(value: string): Promise<void> | void;
}

export type MessageCardCopyResult = "copied" | "unavailable" | "failed";

export interface MessageCardActions {
  copy(): Promise<MessageCardCopyResult>;
  getUrlCard(): LinkMetadataResource | null;
  openUrl(): Promise<boolean>;
}

export function browserMessageClipboard(): MessageCardClipboard | null {
  if (typeof navigator === "undefined" || navigator.clipboard == null) return null;
  return { writeText: (value: string) => navigator.clipboard.writeText(value) };
}

const DEFAULT_ADJACENCY: MessageCardAdjacency = {
  isContinuedFromPrev: false,
  isContinuedToNext: false,
  isGroupStart: false,
  isRunStart: false,
  isFollowedByThreadChip: false,
  isGroupEnd: false
};

const STANDALONE_EMOJI = new RegExp("^\\p{RGI_Emoji}$", "v");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function projectImages(value: unknown): readonly MessageCardImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((image): MessageCardImage[] => {
    if (!isRecord(image) || typeof image.url !== "string" || image.url.length === 0) return [];
    return [{
      url: image.url,
      ...(typeof image.alt === "string" ? { alt: image.alt } : {})
    }];
  });
}

function projectAdjacency(value: Partial<MessageCardAdjacency> | undefined): MessageCardAdjacency {
  return {
    isContinuedFromPrev: value?.isContinuedFromPrev === true,
    isContinuedToNext: value?.isContinuedToNext === true,
    isGroupStart: value?.isGroupStart === true,
    isRunStart: value?.isRunStart === true,
    isFollowedByThreadChip: value?.isFollowedByThreadChip === true,
    isGroupEnd: value?.isGroupEnd === true
  };
}

function isSpecialMessage(value: Record<string, unknown>): boolean {
  return value.fromAgent != null || value.toAgent != null;
}

function isStandaloneEmoji(value: Record<string, unknown>, images: readonly MessageCardImage[]): boolean {
  return value.role === "user" && !isSpecialMessage(value) && images.length === 0 && typeof value.content === "string"
    ? STANDALONE_EMOJI.test(value.content.trim())
    : false;
}

function strictMessageUrl(content: string, richText: string | undefined): string | null {
  const candidate = extractBareLink(content, richText);
  if (candidate == null) return null;
  try {
    return new URL(candidate).protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Projects the shipped message-card discriminant without rendering a duplicate view.
 * Agent-to-agent and other special messages remain explicit unsupported results until
 * their own card contract is available.
 */
export function projectMessageCard(
  value: unknown,
  adjacency: Partial<MessageCardAdjacency> = DEFAULT_ADJACENCY
): MessageCardProjection {
  if (!isRecord(value) || value.kind !== "message" || typeof value.id !== "string" || value.id.length === 0 || typeof value.content !== "string") {
    return { kind: "unsupported", reason: "invalid-entry" };
  }
  if (isSpecialMessage(value)) return { kind: "unsupported", reason: "special-variant" };
  if (value.role !== "user" && value.role !== "assistant") return { kind: "unsupported", reason: "unknown-role" };

  const images = projectImages(value.images);
  const variant = value.role;
  const isFromUser = variant === "user" && value.fromUser != null;
  return {
    kind: "message",
    variant,
    id: value.id,
    content: value.content,
    images,
    ...(isFiniteNumber(value.timestampMs) ? { timestampMs: value.timestampMs } : {}),
    isStreaming: value.isStreaming === true,
    isSourceTrusted: variant === "assistant",
    isStandaloneEmoji: isStandaloneEmoji(value, images),
    isFromUser,
    adjacency: projectAdjacency(adjacency),
    url: variant === "user" && !isFromUser
      ? strictMessageUrl(value.content, typeof value.richText === "string" ? value.richText : undefined)
      : null
  };
}

/** Adapts the mounted transcript model without introducing a second transcript view model. */
export function projectTranscriptMessageCard(
  entry: TranscriptMessage,
  adjacency: Partial<MessageCardAdjacency> = DEFAULT_ADJACENCY
): MessageCardProjection {
  return projectMessageCard({
    kind: "message",
    id: entry.id,
    role: entry.role,
    content: entry.text,
    ...(entry.richText === undefined ? {} : { richText: entry.richText }),
    timestampMs: entry.timestampMs,
    isStreaming: entry.isStreaming
  }, adjacency);
}

/** Mirrors the shipped single-bare-link extraction while reusing the URL-card helper. */
export function extractBareLink(content: string, richText?: string): string | null {
  const trimmed = content.trim();
  const markdown = /^\[[^\]\n]*\]\(\s*([^\)\s]+)(?:\s+[^)]*)?\)\s*$/.exec(trimmed);
  const candidate = markdown?.[1] ?? trimmed;
  if (richText != null) {
    try {
      const document: unknown = JSON.parse(richText);
      if (isRecord(document) && document.type === "doc" && Array.isArray(document.content) && document.content.length === 1) {
        const paragraph = document.content[0];
        if (isRecord(paragraph) && paragraph.type === "paragraph" && Array.isArray(paragraph.content) && paragraph.content.length === 1) {
          const node = paragraph.content[0];
          if (isRecord(node) && node.type === "text" && typeof node.text === "string" && !(Array.isArray(node.marks) && node.marks.some((mark) => isRecord(mark) && mark.type === "code"))) {
            const linkMark = Array.isArray(node.marks) ? node.marks.find((mark) => isRecord(mark) && mark.type === "link") : undefined;
            const attrs = isRecord(linkMark) && isRecord(linkMark.attrs) ? linkMark.attrs : null;
            const href = attrs != null && typeof attrs.href === "string" ? attrs.href : node.text;
            return normalizeMessageLink(href);
          }
        }
      }
    } catch {
      // Fall through to the plain-text form, matching the shipped helper.
    }
  }
  return normalizeMessageLink(candidate);
}

function normalizeMessageLink(value: string): string | null {
  return normalizeLinkUrl(value);
}

export function createMessageCardActions(
  projection: SupportedMessageCard,
  options: { readonly clipboard?: MessageCardClipboard | null; readonly urlCards?: UrlCardProvider | null } = {}
): MessageCardActions {
  const clipboard = options.clipboard === undefined ? browserMessageClipboard() : options.clipboard;
  return {
    copy: async (): Promise<MessageCardCopyResult> => {
      if (projection.variant === "assistant" && projection.isStreaming && projection.content.length === 0) return "unavailable";
      if (clipboard == null) return "unavailable";
      try {
        await clipboard.writeText(projection.content);
        return "copied";
      } catch {
        return "failed";
      }
    },
    getUrlCard: (): LinkMetadataResource | null => projection.url == null || options.urlCards == null
      ? null
      : options.urlCards.stateFor(projection.url),
    openUrl: async (): Promise<boolean> => projection.url != null && options.urlCards != null
      ? options.urlCards.openExternal(projection.url)
      : false
  };
}
