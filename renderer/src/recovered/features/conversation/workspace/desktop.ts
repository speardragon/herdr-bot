import type { DesktopBridge } from "../../../contracts/desktop-bridge";
import type { DraftAttachment } from "./model";

// Immutable root: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4778285 (D9n/F9n unnamed-file staging; UTF-8 region SHA-256 9d660cff2cc10e4b2aea9a6d72a5a5d69d1574a16b75cc7f7b0e5fd5700dd135)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5999839 (D9n/F9n unnamed-file staging; UTF-8 region SHA-256 916b05cca48cf1a047a3dd1c0845d899d3bfabf9d9e0e905b3721685f89d207d)

export interface StageableFile {
  name: string;
  size: number;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface StageFilesResult {
  attachments: DraftAttachment[];
  failures: StageFileFailure[];
  notice: string | null;
}

export type StageFileFailureReason = "empty" | "too-large" | "failed";

export interface StageFileFailure {
  name: string;
  reason: StageFileFailureReason;
}

const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "ogv", "webm"]);

function stageFileName(file: StageableFile): string {
  if (file.name.length > 0) return file.name;
  return file.type?.startsWith("image/") === true ? "image.png" : "file";
}

function isVideoFileName(name: string): boolean {
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  const base = name.slice(slash + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 && VIDEO_EXTENSIONS.has(base.slice(dot + 1));
}

export function formatStageAttachmentFailureNotice(failures: readonly StageFileFailure[]): string | null {
  if (failures.length === 0) return null;
  const first = failures[0];
  if (failures.length === 1 && first != null) {
    if (first.reason === "too-large") {
      const max = isVideoFileName(first.name) ? "200 MB" : "25 MB";
      return `"${first.name}" is too large to attach (max ${max}${isVideoFileName(first.name) ? " for video" : ""}).`;
    }
    if (first.reason === "empty") return `"${first.name}" is empty, so it wasn't attached.`;
    return `Couldn't attach "${first.name}".`;
  }
  if (failures.every((failure) => failure.reason === "too-large")) return `${failures.length} files are too large to attach (max 25 MB, or 200 MB for video).`;
  return `${failures.length} files couldn't be attached.`;
}

export async function stageComposerFiles(
  bridge: Pick<DesktopBridge, "stageAttachmentBytes">,
  files: readonly StageableFile[]
): Promise<StageFilesResult> {
  const results = await Promise.all(files.map(async (file) => {
    const name = stageFileName(file);
    try {
      const result = await bridge.stageAttachmentBytes(name, new Uint8Array(await file.arrayBuffer()));
      return result.ok
        ? { kind: "attachment" as const, attachment: { path: result.path, name, size: file.size, ...(file.type ? { mimeType: file.type } : {}) } }
        : { kind: "failure" as const, failure: { name, reason: result.reason } };
    } catch {
      return { kind: "failure" as const, failure: { name, reason: "failed" as const } };
    }
  }));
  const attachments = results.flatMap((result) => result.kind === "attachment" ? [result.attachment] : []);
  const failures = results.flatMap((result) => result.kind === "failure" ? [result.failure] : []);
  return { attachments, failures, notice: formatStageAttachmentFailureNotice(failures) };
}

export function createFixtureAttachments(files: readonly StageableFile[]): DraftAttachment[] {
  return files.map((file) => ({
    path: `fixture://composer/${encodeURIComponent(file.name)}`,
    name: file.name,
    size: file.size,
    ...(file.type ? { mimeType: file.type } : {})
  }));
}

export async function commitComposerAttachments(
  bridge: Pick<DesktopBridge, "commitStagedAttachments">,
  attachments: readonly DraftAttachment[]
): Promise<DraftAttachment[]> {
  if (attachments.length === 0) return [];
  const committed = await bridge.commitStagedAttachments(
    attachments.map((attachment) => attachment.path),
    attachments.map((attachment) => attachment.name)
  );
  if (committed == null || committed.length !== attachments.length) throw new Error("The desktop bridge could not commit the staged attachments.");
  return attachments.map((attachment, index) => ({ ...attachment, path: committed[index] ?? attachment.path }));
}
