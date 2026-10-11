import type { KeyboardEvent, ReactNode } from "react";
import { Popover } from "./Popover.tsx";
import type { PopoverAnchor, PopoverPoint } from "./Popover.tsx";
import styles from "./Menu.module.css";

export interface MenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchor: PopoverAnchor | PopoverPoint;
  readonly children: ReactNode;
  readonly "aria-label": string;
}

/** A keyboard-navigable menu (ArrowUp/Down moves between items, Enter/Space activates, Escape closes --
 * handled by `MenuItem` + `Popover`'s focus trap). Used directly for a header/overflow menu, and as the
 * base for `ContextMenu` -- a floating DOM menu, not a native macOS menu; this app has no native
 * app/context menu anywhere. */
export function Menu({ open, onClose, anchor, children, ...rest }: MenuProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const root = event.currentTarget;
    const items = [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = items[(currentIndex + delta + items.length) % items.length];
    next?.focus();
  }

  return (
    <Popover open={open} onClose={onClose} anchor={anchor} trapFocus aria-label={rest["aria-label"]}>
      <div role="menu" aria-label={rest["aria-label"]} className={styles["hb-menu"]} onKeyDown={onKeyDown}>
        {children}
      </div>
    </Popover>
  );
}

export interface MenuItemProps {
  readonly children: ReactNode;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  readonly icon?: ReactNode;
}

export function MenuItem({ children, onSelect, danger = false, icon }: MenuItemProps) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={`${styles["hb-menu-item"]} ${danger ? styles["hb-menu-item--danger"] : ""}`} onClick={onSelect}>
      {icon}
      {children}
    </button>
  );
}
