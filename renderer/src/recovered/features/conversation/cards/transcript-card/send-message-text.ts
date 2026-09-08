import { extractSendMessageTextLink, type LinkMetadataResource } from "./url-card";

// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#byteOffset=0 (send-message:text projector consumer)
// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#byteOffset=267 (content/images/streaming guards)
// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#byteOffset=510 (ordinary message projection)
// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#byteOffset=732 (URL-card fallback and trusted source)
// @evidence recovered/frontend/app/assets/view-BuhxMXKm.js#byteOffset=172 (Windows content/images/streaming projection)
// @evidence recovered/frontend/app/assets/view-BuhxMXKm.js#byteOffset=390 (Windows URL-card fallback)
// @evidence recovered/frontend/app/assets/view-BuhxMXKm.js#byteOffset=1210 (Windows trusted ordinary projection)

export const SEND_MESSAGE_TEXT_KIND = "send-message" as const;
export const SEND_MESSAGE_TEXT_TYPE = "text" as const;
export const SEND_MESSAGE_TEXT_URL_UNAVAILABLE = "url-card" as const;

export interface SendMessageTextImage extends Readonly<Record<string, unknown>> {
  readonly url: string;
  readonly alt?: string;
}

export interface SendMessageTextAdjacency {
  readonly isContinuedFromPrev?: boolean;
  readonly isContinuedToNext?: boolean;
  readonly isGroupStart?: boolean;
  readonly isRunStart?: boolean;
  readonly isFollowedByThreadChip?: boolean;
  readonly isGroupEnd?: boolean;
}

export interface SendMessageTextInput {
  readonly kind: typeof SEND_MESSAGE_TEXT_KIND;
  readonly id: string;
  readonly message: {
    readonly type: typeof SEND_MESSAGE_TEXT_TYPE;
    readonly content: string;
    readonly images?: readonly SendMessageTextImage[];
    readonly channel?: string | null;
  };
  readonly streaming?: boolean;
  readonly timestampMs?: number;
}

export type SendMessageTextPresentation =
  | { readonly kind: "text" }
  | { readonly kind: "url-card"; readonly url: string; readonly whenUnavailable: typeof SEND_MESSAGE_TEXT_URL_UNAVAILABLE };

export interface SendMessageTextProjection {
  readonly kind: typeof SEND_MESSAGE_TEXT_KIND;
  readonly id: string;
  readonly message: {
    readonly type: typeof SEND_MESSAGE_TEXT_TYPE;
    readonly content: string;
    readonly images?: readonly SendMessageTextImage[];
    readonly channel?: string | null;
  };
  readonly streaming: boolean;
  readonly timestampMs?: number;
  readonly adjacency: SendMessageTextAdjacency;
  readonly isSourceTrusted: true;
  readonly presentation: SendMessageTextPresentation;
}

export interface InvalidSendMessageText {
  readonly kind: "invalid";
  readonly reason: "entry" | "message" | "images" | "channel" | "streaming" | "timestamp";
}

export type SendMessageTextProjectionResult = SendMessageTextProjection | InvalidSendMessageText;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function projectImages(value: unknown): readonly SendMessageTextImage[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const images: SendMessageTextImage[] = [];
  for (const image of value) {
    if (!isRecord(image) || !nonEmptyString(image.url) || (image.alt !== undefined && typeof image.alt !== "string")) return null;
    images.push({ ...image, url: image.url });
  }
  return images;
}

function projectAdjacency(value: SendMessageTextAdjacency | undefined): SendMessageTextAdjacency {
  return value == null ? {} : { ...value };
}

/** Projects the immutable send-message:text shape without mounting a renderer. */
export function projectSendMessageText(value: unknown, adjacency?: SendMessageTextAdjacency): SendMessageTextProjectionResult {
  if (!isRecord(value) || value.kind !== SEND_MESSAGE_TEXT_KIND || !nonEmptyString(value.id)) return { kind: "invalid", reason: "entry" };
  if (!isRecord(value.message) || value.message.type !== SEND_MESSAGE_TEXT_TYPE || typeof value.message.content !== "string") return { kind: "invalid", reason: "message" };
  if (value.streaming !== undefined && typeof value.streaming !== "boolean") return { kind: "invalid", reason: "streaming" };
  if (value.timestampMs !== undefined && !finiteNumber(value.timestampMs)) return { kind: "invalid", reason: "timestamp" };
  if (value.message.channel !== undefined && value.message.channel !== null && typeof value.message.channel !== "string") return { kind: "invalid", reason: "channel" };
  const images = projectImages(value.message.images);
  if (images === null) return { kind: "invalid", reason: "images" };

  const projected: SendMessageTextProjection = {
    kind: SEND_MESSAGE_TEXT_KIND,
    id: value.id,
    message: {
      type: SEND_MESSAGE_TEXT_TYPE,
      content: value.message.content,
      ...(images === undefined ? {} : { images }),
      ...(value.message.channel === undefined ? {} : { channel: value.message.channel }),
    },
    streaming: value.streaming === true,
    ...(value.timestampMs === undefined ? {} : { timestampMs: value.timestampMs }),
    adjacency: projectAdjacency(adjacency),
    isSourceTrusted: true,
    presentation: { kind: "text" },
  };
  const url = classifySendMessageTextUrl(value);
  return url == null ? projected : { ...projected, presentation: { kind: "url-card", url, whenUnavailable: SEND_MESSAGE_TEXT_URL_UNAVAILABLE } };
}

/** Exact non-streaming, image-free bare-link branch used by the shipped URL-card consumer. */
export function classifySendMessageTextUrl(value: unknown): string | null {
  return extractSendMessageTextLink(value);
}

export function urlCardResourceForSendMessageText(projection: SendMessageTextProjection, resourceFor: (url: string) => LinkMetadataResource): LinkMetadataResource | null {
  return projection.presentation.kind === "url-card" ? resourceFor(projection.presentation.url) : null;
}
