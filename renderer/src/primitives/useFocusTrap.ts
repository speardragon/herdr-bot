import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE_SELECTOR = ["a[href]", "button:not([disabled])", "input:not([disabled])", "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])"].join(",");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => el.offsetParent !== null);
}

/** Traps Tab/Shift+Tab focus inside `containerRef` while `active`, restores focus to whatever was
 * focused beforehand on deactivate, and moves initial focus into the container. Shared by Dialog,
 * Popover/Menu, and ContextMenu -- anything that needs to behave like a modal surface. */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const toFocus = container != null ? (focusableElements(container)[0] ?? container) : null;
    toFocus?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || container == null) return;
      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement;
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus();
    };
  }, [active, containerRef]);
}
