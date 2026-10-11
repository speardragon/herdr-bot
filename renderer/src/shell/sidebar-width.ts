/**
 * Pure sizing/snap logic for the resizable sidebar: default 280px, drag the right edge to
 * resize, drag far enough left and it snaps to an 88px icon rail instead of shrinking further. No DOM
 * here -- the drag handler (see features/sidebar) feeds raw pointer deltas in, and persists the result
 * via `localStorage`/settings.
 */

export const SIDEBAR_WIDTH_DEFAULT = 280;
export const SIDEBAR_WIDTH_MIN = 220;
export const SIDEBAR_WIDTH_MAX = 420;
export const SIDEBAR_RAIL_WIDTH = 88;
/** Dragging the handle to less than this raw width snaps to the icon rail instead of clamping to
 * `SIDEBAR_WIDTH_MIN` -- dragging it below roughly 88px snaps to the icon rail rather than shrinking
 * further or stopping at some intermediate narrow-but-labeled width. */
export const SIDEBAR_SNAP_THRESHOLD = 160;

export type SidebarMode = "expanded" | "rail";

export interface SidebarDragResult {
  readonly width: number;
  readonly mode: SidebarMode;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Maps a raw (unclamped) drag width to the resulting sidebar width + mode. Stateless by design: it
 * only looks at where the pointer currently is, not which mode the sidebar was in a moment ago -- that
 * is exactly what gives the "snap to rail below the threshold, restore above it" behavior for both
 * drag directions without tracking history. */
export function resolveSidebarDrag(rawWidth: number): SidebarDragResult {
  if (rawWidth < SIDEBAR_SNAP_THRESHOLD) return { width: SIDEBAR_RAIL_WIDTH, mode: "rail" };
  return { width: clamp(rawWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX), mode: "expanded" };
}

/** The width to show for a given mode when not actively dragging (e.g. restoring a persisted width, or
 * toggling via ⌘B). `persistedWidth` is only used for "expanded". */
export function widthForMode(mode: SidebarMode, persistedWidth: number): number {
  if (mode === "rail") return SIDEBAR_RAIL_WIDTH;
  return clamp(persistedWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
}
