import { cloneElement, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactElement, Ref } from "react";
import { placeNear } from "./popover-position.ts";
import styles from "./Tooltip.module.css";

const SHOW_DELAY_MS = 400;

export interface TooltipProps {
  readonly label: string;
  /** A single focusable/hoverable element -- the tooltip reads/writes its ref, so this must be an
   * element that forwards `ref` (any DOM host element, e.g. `<button>`, works). */
  readonly children: ReactElement<{ ref?: Ref<HTMLElement> }>;
}

/** A custom hover tooltip -- the OS default `title` tooltip isn't reliable enough for this UI, so it
 * has its own so timing/styling stays consistent. Does not
 * trap focus or steal it -- purely informational. */
export function Tooltip({ label, children }: TooltipProps) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (!open || anchorRef.current == null || panelRef.current == null) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const panel = { width: panelRef.current.offsetWidth, height: panelRef.current.offsetHeight };
    setStyle(placeNear(rect, panel, "bottom-start", { width: window.innerWidth, height: window.innerHeight }));
  }, [open]);

  function show() {
    timer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
  }
  function hide() {
    if (timer.current != null) clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <>
      {cloneElement(children, {
        ref: anchorRef,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      } as never)}
      {open &&
        createPortal(
          <div ref={panelRef} role="tooltip" className={styles["hb-tooltip"]} style={{ top: style?.top ?? -9999, left: style?.left ?? -9999 }}>
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
