import type { AttachmentMedia } from "../../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=1242 (box card state projection)
// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=4426 (attachment URL classification and card branches)
// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#SHA256=3de209b62671d33a486a008fa23d53f069bd77123bba36b9206b9d237bdf9706
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4546989 (image/video extension classification)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5059259 (normalized HTTP URL classification)
// @evidence src/app/dist/renderer/assets/view-DPSBrvyV.js#byteLength=1373 (user-attachment media/file projection)
// @evidence src/app/dist/renderer/assets/view-DPSBrvyV.js#SHA256=5bf28224da62a9042885e9da60e3fce82ed544846f470241ed6bcf4e12e64040

export const USER_ATTACHMENT_RENDERER_CHUNK = {
  file: "src/app/dist/renderer/assets/view-DPSBrvyV.js",
  byteLength: 1373,
  sha256: "5bf28224da62a9042885e9da60e3fce82ed544846f470241ed6bcf4e12e64040",
} as const;

export type AttachmentCardKind = "box" | "legacy-link" | "media" | "file";

export interface AttachmentCardEntry {
  readonly kind: "send-message";
  readonly id: string;
  readonly message: {
    readonly type: "attachment";
    readonly url: string;
    readonly alt?: string;
  };
  readonly boxInstruction?: string;
  readonly boxRequest?: string;
  readonly boxRequestId?: string;
  readonly boxResolution?: string | null;
  readonly boxSnapshot?: string;
  readonly timestampMs?: number;
}

export type AttachmentCardProjection =
  | { readonly kind: "box"; readonly url: string; readonly instruction?: string; readonly request?: string; readonly requestId?: string; readonly resolution?: string | null; readonly screenshotDataUrl?: string; readonly timestampMs?: number }
  | { readonly kind: "legacy-link"; readonly url: string; readonly timestampMs?: number }
  | { readonly kind: "media"; readonly url: string; readonly alt?: string; readonly timestampMs?: number }
  | { readonly kind: "file"; readonly url: string; readonly timestampMs?: number };

export interface AttachmentCardDataAdapter {
  classify(url: string): AttachmentCardKind;
  project(entry: unknown): AttachmentCardProjection | null;
  resolveMedia(url: string): Promise<AttachmentMedia | null>;
}

export interface AttachmentCardDataAdapterOptions {
  resolveAttachmentMedia(url: string): Promise<AttachmentMedia | null>;
}

/** The server shape emitted by the user-attachment card's transcript event. */
export interface UserAttachmentServerEvent {
  readonly kind: "user-attachment";
  readonly id: string;
  readonly file_path: string;
  readonly file_name?: string;
  readonly byteSize?: number;
  readonly width?: number;
  readonly height?: number;
  readonly timestampMs?: number;
  readonly batchId?: string;
  readonly replyTo?: string;
  readonly clientNonce?: string;
}

/** Structurally matches DraftAttachment for the existing gallery/read/download bridge. */
export interface UserAttachmentGalleryAttachment {
  readonly path: string;
  readonly name: string;
  readonly size?: number;
}

export interface UserAttachmentGalleryProjection {
  readonly kind: "media" | "file";
  readonly id: string;
  readonly attachment: UserAttachmentGalleryAttachment;
  readonly width?: number;
  readonly height?: number;
  readonly timestampMs?: number;
  /** The immutable batch identity is retained for adjacent/grouped rendering. */
  readonly batchId?: string;
  readonly replyTo?: string;
  readonly clientNonce?: string;
}

const imageExtensions = new Set([".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const videoExtensions = new Set([".m4v", ".mov", ".mp4", ".ogv", ".webm"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extension(value: string): string {
  let pathname = value;
  try {
    pathname = new URL(value).pathname;
  } catch {
    // The shipped classifier falls back to the raw path for local/file values.
  }
  const lower = pathname.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot < 0 ? "" : lower.slice(dot);
}

function isMediaUrl(value: string): boolean {
  const ext = extension(value);
  return imageExtensions.has(ext) || videoExtensions.has(ext);
}

export function classifyUserAttachmentPath(filePath: string): "media" | "file" {
  return isMediaUrl(filePath) ? "media" : "file";
}

function normalizedHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed) || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isBoxUrl(value: string): boolean {
  return value === "sand://box" || value.startsWith("sand://box?");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function projectEntry(value: unknown, classify: (url: string) => AttachmentCardKind): AttachmentCardProjection | null {
  if (!isRecord(value) || value.kind !== "send-message" || typeof value.id !== "string" || value.id.length === 0 || !isRecord(value.message) || value.message.type !== "attachment" || typeof value.message.url !== "string") return null;
  const url = value.message.url;
  const timestampMs = optionalTimestamp(value.timestampMs);
  const kind = classify(url);
  if (kind === "box") {
    return {
      kind,
      url,
      ...(optionalString(value.boxInstruction) == null ? {} : { instruction: optionalString(value.boxInstruction) }),
      ...(optionalString(value.boxRequest) == null ? {} : { request: optionalString(value.boxRequest) }),
      ...(optionalString(value.boxRequestId) == null ? {} : { requestId: optionalString(value.boxRequestId) }),
      ...(value.boxResolution === null || typeof value.boxResolution === "string" ? { resolution: value.boxResolution ?? null } : {}),
      ...(optionalString(value.boxSnapshot) == null ? {} : { screenshotDataUrl: optionalString(value.boxSnapshot) }),
      ...(timestampMs === undefined ? {} : { timestampMs }),
    };
  }
  if (kind === "legacy-link") return { kind, url: normalizedHttpUrl(url) ?? url, ...(timestampMs === undefined ? {} : { timestampMs }) };
  if (kind === "media") return { kind, url, ...(optionalString(value.message.alt) == null ? {} : { alt: optionalString(value.message.alt) }), ...(timestampMs === undefined ? {} : { timestampMs }) };
  return { kind, url, ...(timestampMs === undefined ? {} : { timestampMs }) };
}

export function classifyAttachmentUrl(url: string): AttachmentCardKind {
  if (isBoxUrl(url)) return "box";
  const normalized = normalizedHttpUrl(url);
  if (normalized != null && !isMediaUrl(normalized)) return "legacy-link";
  return isMediaUrl(url) ? "media" : "file";
}

export function projectAttachmentCardEntry(value: unknown): AttachmentCardProjection | null {
  return projectEntry(value, classifyAttachmentUrl);
}

function optionalNonEmptyMetadata(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

function optionalNonNegativeNumber(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function basename(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const leaf = normalized.slice(normalized.lastIndexOf("/") + 1);
  return leaf.length > 0 ? leaf : "Attachment";
}

function projectUserAttachment(value: Record<string, unknown>): UserAttachmentGalleryProjection | null {
  if (value.kind !== "user-attachment" || typeof value.id !== "string" || value.id.trim().length === 0 || typeof value.file_path !== "string" || value.file_path.trim().length === 0) return null;

  const fileName = value.file_name;
  if (fileName !== undefined && typeof fileName !== "string") return null;
  const byteSize = optionalNonNegativeNumber(value.byteSize);
  const width = optionalNonNegativeNumber(value.width);
  const height = optionalNonNegativeNumber(value.height);
  const timestampMs = optionalNonNegativeNumber(value.timestampMs);
  const batchId = optionalNonEmptyMetadata(value.batchId);
  const replyTo = optionalNonEmptyMetadata(value.replyTo);
  const clientNonce = optionalNonEmptyMetadata(value.clientNonce);
  if (byteSize === null || width === null || height === null || timestampMs === null || batchId === null || replyTo === null || clientNonce === null) return null;

  const name = fileName === undefined || fileName.length === 0 ? basename(value.file_path) : fileName;
  return {
    kind: classifyUserAttachmentPath(value.file_path),
    id: value.id,
    attachment: {
      path: value.file_path,
      name,
      ...(byteSize === undefined ? {} : { size: byteSize }),
    },
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(timestampMs === undefined ? {} : { timestampMs }),
    ...(batchId === undefined ? {} : { batchId }),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(clientNonce === undefined ? {} : { clientNonce }),
  };
}

export function projectUserAttachmentEvent(value: unknown): UserAttachmentGalleryProjection | null {
  return isRecord(value) ? projectUserAttachment(value) : null;
}

export const projectUserAttachmentServerEvent = projectUserAttachmentEvent;

export function createAttachmentCardDataAdapter(options: AttachmentCardDataAdapterOptions): AttachmentCardDataAdapter {
  return {
    classify: classifyAttachmentUrl,
    project: projectAttachmentCardEntry,
    async resolveMedia(url) {
      if (classifyAttachmentUrl(url) !== "media") return null;
      return options.resolveAttachmentMedia(url);
    },
  };
}
