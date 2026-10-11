import { useEffect, useRef } from "react";

/**
 * Works around a real interaction bug whenever a `Popover` (e.g. `Select`'s listbox) is opened from
 * *inside* a `Dialog` (e.g. the New Bot form, Settings): `Popover` closes itself on Escape via a
 * `document`-level **capture**-phase listener registered only while it's open, and `Dialog` closes
 * itself on Escape via a separate `document`-level **bubble**-phase listener -- neither calls
 * `stopPropagation`, so a single Escape press would close the popover *and* the dialog behind it.
 *
 * Fix: register our own `document` capture-phase listener unconditionally at mount time (i.e. well
 * before the popover can ever be opened by a click). Capture-phase listeners on the same node fire in
 * registration order, so ours -- registered first, since this hook is called unconditionally by the
 * trigger component on mount, before the user can ever open the popover -- intercepts Escape before
 * `Popover`'s own listener even runs, calls `stopImmediatePropagation()` (which also blocks `Popover`'s
 * same-phase listener and any further bubbling to `Dialog`), and closes the popover ourselves via
 * `onEscape`. Net effect: the popover closes, the dialog underneath does not.
 *
 * Used by every `Select`, since the same popover-in-a-dialog shape belongs to the shared `Select`
 * primitive, not to any one feature.
 */
export function useEscapeOwnership(active: boolean, onEscape: () => void): void {
  const stateRef = useRef({ active, onEscape });
  stateRef.current = { active, onEscape };

  useEffect(() => {
    function onKeyDownCapture(event: KeyboardEvent) {
      if (event.key !== "Escape" || !stateRef.current.active) return;
      event.stopImmediatePropagation();
      stateRef.current.onEscape();
    }
    document.addEventListener("keydown", onKeyDownCapture, true);
    return () => document.removeEventListener("keydown", onKeyDownCapture, true);
  }, []);
}
