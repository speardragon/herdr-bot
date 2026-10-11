/**
 * Pure roving-index arithmetic shared by the sidebar's row list and the command palette's result list
 * (both need "ArrowDown/ArrowUp moves, wrapping at the ends; Home/End jumps" over a flat array whose
 * length can change between keystrokes). No DOM/React here -- the component owns actually moving focus
 * or highlight state, this just computes the next index.
 */

/** Moves `current` by `delta` positions, wrapping around `count` items. Returns `-1` (no selection)
 * when `count` is 0. `current === -1` is treated as "one before the start" so the first ArrowDown from
 * an unselected list lands on index 0. */
export function moveIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  const next = (((current + delta) % count) + count) % count;
  return next;
}

/** Clamps a previously-selected index into range after the underlying list changed size (e.g. a
 * filter narrowed the results) -- `-1` only when the list is now empty. */
export function clampIndex(current: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return 0;
  return Math.min(current, count - 1);
}
