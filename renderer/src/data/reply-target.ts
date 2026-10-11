/**
 * Reply target coordination: the message hover "Reply" action feeds the composer's reply-preview bar.
 *
 * There is no `replyTarget` field on the shared `AppState` in `data/store/types.ts` -- a reply target is
 * transient, per-chat UI state, not host-synced data -- so this is a tiny standalone module-level store,
 * shared between `features/conversation` (sets it from the message hover "Reply" action) and
 * `features/composer` (reads it to render the quote strip and to populate `message.send`'s `replyTo`).
 * In-memory only (not persisted across an app restart), unlike the draft it rides alongside.
 *
 * Usage:
 * ```ts
 * import { setReplyTarget, useReplyTarget } from "../../data/reply-target.ts";
 *
 * // From the message hover "Reply" action:
 * setReplyTarget(chatId, { entryId, authorName, preview });
 *
 * // From the composer:
 * const reply = useReplyTarget(chatId); // { target, clear }
 * ```
 *
 * `preview` should be a short plain-text snippet of the message being replied to -- the composer only
 * renders whatever's passed in, it never re-fetches the transcript. The composer calls `reply.clear()`
 * (or the module-level `clearReplyTarget(chatId)`) once the reply sends or the bar's own "x" is clicked.
 */
import { useSyncExternalStore } from "react";

export interface ReplyTarget {
  readonly entryId: string;
  readonly authorName: string;
  /** A short, already-plain-text (not markdown) preview of the quoted message for the composer to show. */
  readonly preview: string;
}

type Listener = () => void;

const targets = new Map<string, ReplyTarget>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getReplyTarget(chatId: string): ReplyTarget | null {
  return targets.get(chatId) ?? null;
}

export function setReplyTarget(chatId: string, target: ReplyTarget): void {
  targets.set(chatId, target);
  emit();
}

export function clearReplyTarget(chatId: string): void {
  if (!targets.has(chatId)) return;
  targets.delete(chatId);
  emit();
}

export function subscribeReplyTarget(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only escape hatch so test files don't depend on import order across test files. */
export function resetReplyTargetsForTests(): void {
  targets.clear();
}

export interface ReplyTargetHandle {
  readonly target: ReplyTarget | null;
  clear(): void;
}

/** The composer's own view of `chatId`'s current reply target (`null` once cleared/sent/never set). */
export function useReplyTarget(chatId: string | null): ReplyTargetHandle {
  const target = useSyncExternalStore(subscribeReplyTarget, () => (chatId == null ? null : getReplyTarget(chatId)));
  return { target, clear: () => chatId != null && clearReplyTarget(chatId) };
}
