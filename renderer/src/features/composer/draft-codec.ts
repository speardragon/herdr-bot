/**
 * Per-chat draft (de)serialization. `data/drafts.ts`'s `DraftStore` is deliberately opaque (just
 * `get/set/clear(chatId, string)`, see its own file comment and this folder's README) -- it doesn't
 * know or care what's inside the string. This module is the serialize/parse layer on top: a draft is
 * the composer's Tiptap document plus its staged attachments and mentions, not plain text.
 *
 * Backward compatibility: an earlier version of `ComposerSlot` stored a bare plain-text string under
 * this same `localStorage` key. `decodeDraft` must treat anything that isn't valid JSON (or is JSON but
 * not shaped like a `ComposerDraftState`) as that legacy plain text rather than discarding it -- an
 * existing unsent draft shouldn't silently vanish because of the format change.
 *
 * Pure/DOM-free so it's unit-testable against plain strings (`renderer/test/composer-draft-codec.test.ts`).
 */
import type { DocNode } from "./rich-text.ts";
import { isDocEmpty } from "./rich-text.ts";

export interface StagedAttachmentDraft {
  readonly path: string;
  readonly filename: string;
  readonly size: number;
}

export interface ComposerDraftState {
  readonly doc: DocNode;
  readonly attachments: readonly StagedAttachmentDraft[];
}

const EMPTY_DOC: DocNode = { type: "doc", content: [{ type: "paragraph", content: [] }] };

export const EMPTY_DRAFT: ComposerDraftState = { doc: EMPTY_DOC, attachments: [] };

function plainTextDoc(text: string): DocNode {
  if (text.length === 0) return EMPTY_DOC;
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function isStagedAttachmentDraft(value: unknown): value is StagedAttachmentDraft {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate["path"] === "string" && typeof candidate["filename"] === "string" && typeof candidate["size"] === "number";
}

function isComposerDraftState(value: unknown): value is ComposerDraftState {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate["doc"] == null || typeof candidate["doc"] !== "object") return false;
  if (!Array.isArray(candidate["attachments"])) return false;
  return candidate["attachments"].every(isStagedAttachmentDraft);
}

export function isDraftEmpty(state: ComposerDraftState): boolean {
  return isDocEmpty(state.doc) && state.attachments.length === 0;
}

/** `""` on an empty draft (so `DraftStore.set` takes its own "clear the key" branch rather than
 * persisting a tiny JSON blob for nothing). */
export function encodeDraft(state: ComposerDraftState): string {
  if (isDraftEmpty(state)) return "";
  return JSON.stringify(state);
}

/** Never throws: a blank string is the empty draft, invalid/legacy JSON is treated as a pre-existing
 * plain-text draft, and a parse that doesn't even look like text degrades to empty rather than crashing
 * the composer on mount. */
export function decodeDraft(raw: string): ComposerDraftState {
  if (raw.length === 0) return EMPTY_DRAFT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { doc: plainTextDoc(raw), attachments: [] };
  }
  if (isComposerDraftState(parsed)) return parsed;
  // Valid JSON, but not our shape (or genuinely someone's plain-text draft that happens to parse as JSON,
  // e.g. the literal draft text `"123"` or `"true"`) -- safest is still to treat the raw string as plain
  // text rather than guess further.
  return { doc: plainTextDoc(raw), attachments: [] };
}
