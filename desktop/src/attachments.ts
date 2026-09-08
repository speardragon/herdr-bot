import type { BrowserWindow, Dialog } from "electron";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface AttachmentService {
  readonly handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown> | unknown>;
}

export interface AttachmentServiceDeps {
  readonly dialog: Dialog | null;
  readonly window: BrowserWindow | null;
  readonly userDataDir: string;
}

export const MAX_STAGED_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".svg", ".ico"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".ogv"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".oga", ".opus", ".weba"]);
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".avif": "image/avif", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

export function safeFilename(name: string): string {
  const base = basename(name).replace(/[^A-Za-z0-9._-]+/g, "-");
  return base.length > 0 ? base : "attachment";
}

export function mediaKindFor(path: string): "image" | "video" | "audio" | null {
  const extension = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  return null;
}

export function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000);
  for (const byte of sample) if (byte === 0) return true;
  return false;
}

function str(args: Record<string, unknown>, key: string): string | null {
  return typeof args[key] === "string" && (args[key] as string).length > 0 ? (args[key] as string) : null;
}

export function createAttachmentService(deps: AttachmentServiceDeps): AttachmentService {
  const stagedDir = join(deps.userDataDir, "staged");
  const isStaged = (path: string): boolean => resolve(path).startsWith(resolve(stagedDir) + "/");

  return {
    handlers: {
      stageAttachmentBytes: ({ filename, bytes }) => {
        const buffer = bytes instanceof Uint8Array ? Buffer.from(bytes) : null;
        if (buffer == null || buffer.length === 0) return { ok: false, reason: "empty" };
        if (buffer.length > MAX_STAGED_BYTES) return { ok: false, reason: "too-large" };
        mkdirSync(stagedDir, { recursive: true });
        const path = join(stagedDir, `${randomUUID()}-${safeFilename(String(filename ?? "attachment"))}`);
        try {
          writeFileSync(path, buffer);
        } catch {
          return { ok: false, reason: "failed" };
        }
        return { ok: true, path };
      },
      commitStagedAttachments: ({ paths }) => (Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string") : null),
      discardStagedAttachment: ({ path }) => {
        const target = typeof path === "string" ? path : "";
        if (isStaged(target)) { try { unlinkSync(target); } catch { /* already gone */ } }
      },
      resolveAttachmentMedia: (args) => {
        const source = str(args, "source");
        if (source == null) return null;
        const path = source.startsWith("file://") ? decodeURIComponent(new URL(source).pathname) : source;
        const kind = mediaKindFor(path);
        if (kind == null) return null;
        if (kind === "image") {
          try {
            const mime = MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? "application/octet-stream";
            return { kind, dataUrl: `data:${mime};base64,${readFileSync(path).toString("base64")}`, width: null, height: null };
          } catch {
            return null;
          }
        }
        return kind === "video" ? { kind, src: pathToFileURL(path).href, width: null, height: null } : { kind, src: pathToFileURL(path).href };
      },
      readAttachmentText: (args) => {
        const path = str(args, "path");
        if (path == null) return null;
        let buffer: Buffer;
        try { buffer = readFileSync(path); } catch { return null; }
        if (looksBinary(buffer)) return { kind: "binary", bytes: buffer.length };
        const truncated = buffer.length > MAX_TEXT_BYTES;
        return { kind: "text", text: buffer.subarray(0, MAX_TEXT_BYTES).toString("utf8"), truncated, bytes: buffer.length };
      },
      readAttachmentBytes: (args) => {
        const path = str(args, "path");
        const maxBytes = typeof args.maxBytes === "number" ? args.maxBytes : MAX_STAGED_BYTES;
        if (path == null) return null;
        let size: number;
        try { size = statSync(path).size; } catch { return null; }
        if (size > maxBytes) return { kind: "too-large", size };
        return { kind: "bytes", bytes: new Uint8Array(readFileSync(path)) };
      },
      downloadAttachment: async (args) => {
        const path = str(args, "path");
        if (path == null || deps.dialog == null || deps.window == null) return false;
        const result = await deps.dialog.showSaveDialog(deps.window, { defaultPath: str(args, "suggestedName") ?? basename(path) });
        if (result.canceled || result.filePath == null) return false;
        copyFileSync(path, result.filePath);
        return true;
      },
      pickAvatarFile: async () => {
        if (deps.dialog == null || deps.window == null) return null;
        const result = await deps.dialog.showOpenDialog(deps.window, { properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] });
        const file = result.filePaths[0];
        if (result.canceled || file == null) return null;
        const mime = MIME_BY_EXTENSION[extname(file).toLowerCase()] ?? "image/png";
        return { dataUrl: `data:${mime};base64,${readFileSync(file).toString("base64")}`, fileName: basename(file) };
      },
    },
  };
}
