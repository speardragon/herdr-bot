/**
 * Jump-to-message: opening a message search result jumps to that chat and highlights/scrolls to the
 * message. `data/store/*`'s reducer state has no "focus entry" field -- this is transient UI state,
 * not host-synced data -- so this is a small additive module-level store of its own, a singleton outside
 * React exposed via `useSyncExternalStore` (same pattern `data/store/create-store.ts` uses).
 *
 * Shared between `features/palette` (requests a jump when a message search result is selected) and
 * `features/conversation` (owns the transcript, pages older history until the entry is loaded, scrolls it
 * into view, and flashes a highlight).
 *
 * Usage: on selecting a `MessageSearchHit`, call `useActiveChat().setActiveChatId(hit.chatId)` and then
 * `requestJumpToMessage(hit.chatId, hit.entryId)`. `Transcript.tsx` reads the target with
 * `useJumpTarget(chatId)`: if the entry isn't loaded yet it keeps calling `loadOlder()` until it appears
 * (or history runs out), then scrolls it into view and applies a highlight class for a couple of seconds
 * before auto-clearing (`clearJumpTarget()`).
 */
import { useSyncExternalStore } from "react";

export interface JumpTarget {
  readonly chatId: string;
  readonly entryId: string;
  /** Distinguishes two requests for the *same* entry id back-to-back (e.g. selecting the same search hit
   * twice) so the consumer's `useEffect` re-fires instead of seeing an unchanged value. */
  readonly token: number;
}

let current: JumpTarget | null = null;
let tokenSeq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function requestJumpToMessage(chatId: string, entryId: string): void {
  tokenSeq += 1;
  current = { chatId, entryId, token: tokenSeq };
  emit();
}

export function clearJumpTarget(): void {
  if (current == null) return;
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): JumpTarget | null {
  return current;
}

/** `null` unless a jump was requested for exactly this `chatId` and hasn't been cleared yet. */
export function useJumpTarget(chatId: string | null): JumpTarget | null {
  return useSyncExternalStore(subscribe, () => (chatId != null && current?.chatId === chatId ? current : null));
}

/** Test-only: reads the current request without a React subscription. */
export function peekJumpTarget(): JumpTarget | null {
  return current;
}

/** Test-only escape hatch so test files don't depend on import order across test files. */
export function resetJumpTargetForTests(): void {
  current = null;
  tokenSeq = 0;
}
