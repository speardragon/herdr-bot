/** Pure placement math for Popover/Menu/ContextMenu/Tooltip -- given an anchor rect (or a bare point)
 * and the floating panel's own measured size, returns a viewport-clamped `{top,left}`. No DOM access so
 * it is unit-testable; callers measure the real DOM and pass plain numbers in. */

export interface Rect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

const GUTTER = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Picks `preferred`'s side (bottom/top) unless it doesn't fit in the viewport but the opposite side
 * does -- e.g. a `Select` listbox opened near the bottom of the viewport flips to open upward instead of
 * rendering clamped and overlapping its own trigger. Keeps `preferred`'s horizontal half (start/end)
 * unchanged. Pure/measurement-only so it's unit-testable; `placeNear` still does the final clamp. */
export function resolveVerticalPlacement(anchor: Rect, panel: Size, preferred: Placement, viewport: Viewport): Placement {
  const [side, half] = preferred.split("-") as ["bottom" | "top", "start" | "end"];
  const spaceBelow = viewport.height - (anchor.top + anchor.height);
  const spaceAbove = anchor.top;
  const fitsBelow = spaceBelow >= panel.height + GUTTER;
  const fitsAbove = spaceAbove >= panel.height + GUTTER;
  if (side === "bottom" && !fitsBelow && fitsAbove) return `top-${half}`;
  if (side === "top" && !fitsAbove && fitsBelow) return `bottom-${half}`;
  return preferred;
}

/** Positions a floating panel relative to an anchor rect, then clamps it fully inside the viewport (with
 * an 8px gutter) so it never renders off-screen near an edge. */
export function placeNear(anchor: Rect, panel: Size, placement: Placement, viewport: Viewport): { top: number; left: number } {
  const top = placement.startsWith("bottom") ? anchor.top + anchor.height + 4 : anchor.top - panel.height - 4;
  const left = placement.endsWith("start") ? anchor.left : anchor.left + anchor.width - panel.width;
  return {
    top: clamp(top, GUTTER, viewport.height - panel.height - GUTTER),
    left: clamp(left, GUTTER, viewport.width - panel.width - GUTTER),
  };
}

/** Positions a floating panel at a bare point (a context-menu click) rather than relative to an
 * element, still clamped inside the viewport. */
export function placeAtPoint(point: { x: number; y: number }, panel: Size, viewport: Viewport): { top: number; left: number } {
  return {
    top: clamp(point.y, GUTTER, viewport.height - panel.height - GUTTER),
    left: clamp(point.x, GUTTER, viewport.width - panel.width - GUTTER),
  };
}
