import type { BrowserWindow, Dialog } from "electron";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface AttachmentService {
  readonly handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown> | unknown>;
}

export interface AttachmentServiceDeps {
  readonly dialog: Dialog | null;
  readonly window: BrowserWindow | null;
  readonly userDataDir: string;
  /** Images above this size never get a `dataUrl` preview (the renderer falls back to its file chip). */
  readonly maxImagePreviewBytes?: number;
  /** How many bytes of a text attachment get read into memory (and returned) at most. */
  readonly maxTextBytes?: number;
}

export const MAX_STAGED_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024;

/** True when `path` resolves to somewhere inside `dir` -- used to keep every attachment operation that
 * takes an arbitrary renderer-supplied path from touching anything outside the staged-attachments dir. */
export function isPathWithinDir(path: string, dir: string): boolean {
  return resolve(path).startsWith(resolve(dir) + "/");
}

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

/** Shared by `pickAvatarFile` (exported separately so a test can exercise the size-rejection logic
 * without going through an Electron open-file dialog). A file over `maxBytes` comes back `null`, same
 * as if the user had cancelled the picker. */
export async function readAvatarDataUrl(file: string, maxBytes: number = MAX_STAGED_BYTES): Promise<{ dataUrl: string; fileName: string } | null> {
  try {
    const { size } = await stat(file);
    if (size > maxBytes) return null;
    const mime = MIME_BY_EXTENSION[extname(file).toLowerCase()] ?? "image/png";
    return { dataUrl: `data:${mime};base64,${(await readFile(file)).toString("base64")}`, fileName: basename(file) };
  } catch {
    return null;
  }
}

export function createAttachmentService(deps: AttachmentServiceDeps): AttachmentService {
  const stagedDir = join(deps.userDataDir, "staged");
  const isStaged = (path: string): boolean => isPathWithinDir(path, stagedDir);
  const maxImagePreviewBytes = deps.maxImagePreviewBytes ?? MAX_IMAGE_PREVIEW_BYTES;
  const maxTextBytes = deps.maxTextBytes ?? MAX_TEXT_BYTES;

  return {
    handlers: {
      stageAttachmentBytes: async ({ filename, bytes }) => {
        if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return { ok: false, reason: "empty" };
        if (bytes.byteLength > MAX_STAGED_BYTES) return { ok: false, reason: "too-large" };
        await mkdir(stagedDir, { recursive: true });
        const path = join(stagedDir, `${randomUUID()}-${safeFilename(String(filename ?? "attachment"))}`);
        try {
          await writeFile(path, bytes);
        } catch {
          return { ok: false, reason: "failed" };
        }
        return { ok: true, path };
      },
      commitStagedAttachments: ({ paths }) => (Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string") : null),
      discardStagedAttachment: async ({ path }) => {
        const target = typeof path === "string" ? path : "";
        if (isStaged(target)) { try { await unlink(target); } catch { /* already gone */ } }
      },
      // Runs on the main process, which also carries IPC for every other window -- a
      // multi-megabyte image read+base64-encode done synchronously would block the whole app, so this
      // (and every other handler below) uses node:fs/promises instead of its *Sync sibling.
      resolveAttachmentMedia: async (args) => {
        const source = str(args, "source");
        if (source == null) return null;
        const path = source.startsWith("file://") ? decodeURIComponent(new URL(source).pathname) : source;
        const kind = mediaKindFor(path);
        if (kind == null) return null;
        if (kind === "image") {
          try {
            const { size } = await stat(path);
            if (size > maxImagePreviewBytes) return null; // renderer falls back to its file-chip view
            const mime = MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? "application/octet-stream";
            return { kind, dataUrl: `data:${mime};base64,${(await readFile(path)).toString("base64")}`, width: null, height: null };
          } catch {
            return null;
          }
        }
        return kind === "video" ? { kind, src: pathToFileURL(path).href, width: null, height: null } : { kind, src: pathToFileURL(path).href };
      },
      readAttachmentText: async (args) => {
        const path = str(args, "path");
        if (path == null) return null;
        let handle;
        try { handle = await open(path, "r"); } catch { return null; }
        try {
          const { size } = await handle.stat();
          const buffer = Buffer.alloc(Math.min(size, maxTextBytes));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          const sample = buffer.subarray(0, bytesRead);
          if (looksBinary(sample)) return { kind: "binary", bytes: size };
          return { kind: "text", text: sample.toString("utf8"), truncated: size > maxTextBytes, bytes: size };
        } catch {
          return null;
        } finally {
          await handle.close();
        }
      },
      readAttachmentBytes: async (args) => {
        const path = str(args, "path");
        const maxBytes = typeof args.maxBytes === "number" ? args.maxBytes : MAX_STAGED_BYTES;
        if (path == null) return null;
        let size: number;
        try { size = (await stat(path)).size; } catch { return null; }
        if (size > maxBytes) return { kind: "too-large", size };
        return { kind: "bytes", bytes: new Uint8Array(await readFile(path)) };
      },
      downloadAttachment: async (args) => {
        const path = str(args, "path");
        if (path == null || deps.dialog == null || deps.window == null) return false;
        const result = await deps.dialog.showSaveDialog(deps.window, { defaultPath: str(args, "suggestedName") ?? basename(path) });
        if (result.canceled || result.filePath == null) return false;
        await copyFile(path, result.filePath);
        return true;
      },
      pickDirectory: async (args) => {
        if (deps.dialog == null || deps.window == null) return null;
        const defaultPath = str(args, "defaultPath");
        const result = await deps.dialog.showOpenDialog(deps.window, { properties: ["openDirectory", "createDirectory"], ...(defaultPath == null ? {} : { defaultPath }) });
        const directory = result.filePaths[0];
        return result.canceled || directory == null ? null : directory;
      },
      pickAvatarFile: async () => {
        if (deps.dialog == null || deps.window == null) return null;
        const result = await deps.dialog.showOpenDialog(deps.window, { properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] });
        const file = result.filePaths[0];
        if (result.canceled || file == null) return null;
        return readAvatarDataUrl(file, MAX_STAGED_BYTES);
      },
    },
  };
}
