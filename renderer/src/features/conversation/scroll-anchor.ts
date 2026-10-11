/**
 * Pure scroll-position math for the transcript: opens pinned to the latest message (also
 * after late layout growth), keeps position when older pages load. Kept DOM-free so the arithmetic is
 * unit-testable without a real scrollable element; `Transcript.tsx` is the only place that reads/writes
 * an actual `scrollTop`.
 */

/** True when the viewport's bottom edge is within `threshold`px of the content's bottom -- the
 * "currently pinned to the latest message" test used to decide whether a new/growing entry should
 * auto-scroll the view down, or leave it alone (the user scrolled up to read history). */
export function isNearBottom(scrollTop: number, scrollHeight: number, clientHeight: number, threshold = 80): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

/** After prepending an older page above the current content, the browser keeps `scrollTop` numerically
 * fixed -- which visually yanks the reader down into content they'd already scrolled past. The fix is to
 * add back exactly the height the prepend grew the content by, computed from a `scrollHeight` measured
 * just before and just after the prepend. */
export function olderPageScrollAdjustment(prevScrollHeight: number, nextScrollHeight: number): number {
  return Math.max(0, nextScrollHeight - prevScrollHeight);
}

/** Whether the top-of-history sentinel is close enough to the viewport to start `loadOlder()` -- a small
 * negative/zero threshold means "the sentinel has scrolled into (or past) the visible top edge". */
export function isNearTop(scrollTop: number, threshold = 80): boolean {
  return scrollTop <= threshold;
}
