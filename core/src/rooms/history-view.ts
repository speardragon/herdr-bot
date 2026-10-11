import type { RoomMessage } from "./types.ts";

function lastSpokenIndex(history: readonly RoomMessage[], memberId: string): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const speaker = history[index]?.speaker;
    if (speaker?.kind === "member" && speaker.id === memberId) return index;
  }
  return -1;
}

/**
 * Everything in `history` strictly after the last entry `memberId` itself spoke -- a per-member,
 * running-total view, not scoped to the current round or cycle. A member that has never spoken sees
 * the entire transcript.
 */
export function newSince(history: readonly RoomMessage[], memberId: string): RoomMessage[] {
  const index = lastSpokenIndex(history, memberId);
  return index === -1 ? [...history] : history.slice(index + 1);
}

/** Keeps only the most recent `limit` items (older ones are dropped, not summarized). */
export function truncateTail<T>(items: readonly T[], limit: number): T[] {
  return items.length <= limit ? [...items] : items.slice(items.length - limit);
}
