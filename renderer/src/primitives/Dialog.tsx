import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton.tsx";
import { useFocusTrap } from "./useFocusTrap.ts";
import styles from "./Dialog.module.css";

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  /** Set by a caller that wants a width other than the default 520px (e.g. the palette's 560px). */
  readonly width?: number;
}

/** A centered modal over a scrim: focus-trapped, closes on Escape or a scrim click, and portals to
 * `document.body` so it always sits above the app shell regardless of where it's rendered from. */
export function Dialog({ open, onClose, title, closeLabel, children, width }: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, open);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles["hb-dialog-scrim"]}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={containerRef} role="dialog" aria-modal="true" aria-label={title} className={styles["hb-dialog"]} style={width != null ? { width } : undefined}>
        {title != null && (
          <div className={styles["hb-dialog-header"]}>
            <div className={styles["hb-dialog-title"]}>{title}</div>
            <IconButton aria-label={closeLabel} size="sm" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
