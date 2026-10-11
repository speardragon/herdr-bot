/**
 * Attachment validation: pure, DOM-free so it's unit-testable without a real `File`. There are two
 * layers deliberately kept separate:
 *
 * 1. `validateAttachmentCandidate` -- an immediate, client-side pre-check (size/emptiness) run before
 *    ever reading the file's bytes or round-tripping to the bridge, so obviously-bad input gets instant
 *    feedback instead of waiting on an IPC call.
 * 2. `attachmentErrorMessageKey` -- maps `window.herdrBot.attachments.stage()`'s own
 *    `StageAttachmentResult` failure `reason` (`"empty" | "too-large" | "failed"`, see `data/bridge.ts`)
 *    to an i18n key. This is the authoritative check (the host enforces its own 25MB cap independently of
 *    whatever the client pre-checked), so both layers map to the same three reasons rather than
 *    duplicating a second, possibly-drifting limit.
 */

/** Mirrors the host's own `stageAttachmentBytes` 25MB cap. Kept here too so the composer can reject an
 * obviously-oversized file before even reading its bytes. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type AttachmentRejectionReason = "empty" | "too-large";

export interface AttachmentCandidate {
  readonly size: number;
}

/** `null` means "fine, go ahead and stage it". */
export function validateAttachmentCandidate(file: AttachmentCandidate): AttachmentRejectionReason | null {
  if (file.size <= 0) return "empty";
  if (file.size > MAX_ATTACHMENT_BYTES) return "too-large";
  return null;
}

/** Every reason `StageAttachmentResult`/the pre-check can report, mapped to its `composer.*` i18n key. */
export function attachmentErrorMessageKey(reason: AttachmentRejectionReason | "failed"): string {
  switch (reason) {
    case "empty":
      return "composer.attachment.error.empty";
    case "too-large":
      return "composer.attachment.error.tooLarge";
    case "failed":
      return "composer.attachment.error.failed";
  }
}
