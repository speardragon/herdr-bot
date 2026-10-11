import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isPathWithinDir } from "./attachments.ts";

export const DEFAULT_SWEEP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StagedAttachmentSweepDeps {
  /** <userData>/staged -- the only directory this ever deletes from. */
  readonly stagedDir: string;
  /** Every file whose text might mention a staged attachment's path (built by `hostReferenceFiles` plus
   * the desktop settings JSON path -- see main.ts). */
  readonly referenceFiles: readonly string[];
  readonly now: () => number;
  readonly maxAgeMs?: number;
}

export interface StagedAttachmentSweepResult {
  readonly removed: readonly string[];
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** The host's bots/*  and rooms/* transcripts -- the only place (besides the settings JSON, which the
 * caller adds separately) a staged attachment path can be referenced from. Kept separate from the pure
 * sweep below so that function never has to know the host's directory layout. */
export async function hostReferenceFiles(hostHome: string): Promise<string[]> {
  const files: string[] = [];
  for (const group of ["bots", "rooms"] as const) {
    const groupDir = join(hostHome, group);
    let ids: string[];
    try {
      ids = await readdir(groupDir);
    } catch {
      continue;
    }
    for (const id of ids) files.push(join(groupDir, id, "transcript.jsonl"));
  }
  return files;
}

/**
 * `<userData>/staged/` is the permanent store for every attachment ever sent or dropped into
 * the composer (commitStagedAttachments is a passthrough -- nothing ever moves the file), so nothing
 * ever shrank it on its own. This deletes files under `stagedDir` older than `maxAgeMs` (default 7
 * days) that are not mentioned, by basename, in any of `referenceFiles`: a transcript references an
 * attachment via `(attached: <path>)` in its content, and the desktop settings JSON persists a draft's
 * attachment paths under its `persist:` keys -- either is enough to keep the file.
 *
 * Matches on basename rather than the full path: stageAttachmentBytes names every staged file
 * `${uuid}-${safeFilename}`, which is already collision-free, and a basename needle survives JSON
 * escaping of the settings blob, `file://` URL forms, and path-separator differences that a full-path
 * substring match would not.
 *
 * Pure aside from the injected clock and file list, so it is directly testable against a temp
 * directory; never touches anything outside `stagedDir`.
 */
export async function sweepStagedAttachments(deps: StagedAttachmentSweepDeps): Promise<StagedAttachmentSweepResult> {
  const maxAgeMs = deps.maxAgeMs ?? DEFAULT_SWEEP_MAX_AGE_MS;
  const cutoff = deps.now() - maxAgeMs;
  let entries: string[];
  try {
    entries = await readdir(deps.stagedDir);
  } catch {
    return { removed: [] };
  }
  const referenceTexts = (await Promise.all(deps.referenceFiles.map(readIfExists))).filter((text): text is string => text != null);
  const removed: string[] = [];
  for (const name of entries) {
    const path = resolve(join(deps.stagedDir, name));
    if (!isPathWithinDir(path, deps.stagedDir)) continue; // never delete outside staged/
    let info;
    try {
      info = await stat(path);
    } catch {
      continue;
    }
    if (!info.isFile() || info.mtimeMs > cutoff) continue;
    const isReferenced = referenceTexts.some((text) => text.includes(name));
    if (isReferenced) continue;
    try {
      await unlink(path);
      removed.push(path);
    } catch {
      /* best effort -- picked up again on the next sweep */
    }
  }
  return { removed };
}
