import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { placeAtPoint, placeNear, resolveVerticalPlacement } from "./popover-position.ts";
import type { Placement } from "./popover-position.ts";
import { useFocusTrap } from "./useFocusTrap.ts";
import styles from "./Popover.module.css";

export interface PopoverAnchor {
  readonly kind: "element";
  readonly element: HTMLElement;
  readonly placement?: Placement;
  /** Flips `placement` vertically (bottom<->top) if it doesn't fit but the opposite side does --
   * `Select`'s listbox wants this (so it opens upward near the bottom of the viewport, like a native
   * `<select>`); off by default so every other current `placement?`-only caller (Menu/ContextMenu/
   * Tooltip) keeps its exact previous clamped-but-unflipped behavior. */
  readonly autoFlip?: boolean;
}

export interface PopoverPoint {
  readonly kind: "point";
  readonly x: number;
  readonly y: number;
}

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchor: PopoverAnchor | PopoverPoint;
  readonly children: ReactNode;
  readonly "aria-label"?: string;
  /** Traps Tab focus like a Dialog -- set for a Menu/ContextMenu, leave off for a lightweight hover
   * popover (e.g. Tooltip) that shouldn't steal focus. */
  readonly trapFocus?: boolean;
}

/** The shared floating-panel primitive behind Menu/ContextMenu and any custom popover a feature slice
 * needs: portals to `document.body`, positions itself near an element or at a point (clamped inside the
 * viewport, see popover-position.ts), and closes on Escape or an outside click. */
export function Popover({ open, onClose, anchor, children, trapFocus = false, ...rest }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null);
  useFocusTrap(panelRef, open && trapFocus);

  useLayoutEffect(() => {
    if (!open || panelRef.current == null) return;
    const panelSize = { width: panelRef.current.offsetWidth, height: panelRef.current.offsetHeight };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (anchor.kind === "point") {
      setStyle(placeAtPoint({ x: anchor.x, y: anchor.y }, panelSize, viewport));
    } else {
      const rect = anchor.element.getBoundingClientRect();
      const preferred = anchor.placement ?? "bottom-start";
      const placement = anchor.autoFlip === true ? resolveVerticalPlacement(rect, panelSize, preferred, viewport) : preferred;
      setStyle(placeNear(rect, panelSize, placement, viewport));
    }
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (panelRef.current != null && !panelRef.current.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div ref={panelRef} role="dialog" aria-label={rest["aria-label"]} className={styles["hb-popover"]} style={{ top: style?.top ?? -9999, left: style?.left ?? -9999, visibility: style == null ? "hidden" : "visible" }}>
      {children}
    </div>,
    document.body,
  );
}
