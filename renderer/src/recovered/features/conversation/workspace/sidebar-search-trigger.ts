// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2605212 (a0n search control; source region 2605212-2606109; sha256 cbb6b6ce9cdb3ac9e77d59bc66c8a49d5c9e2e5ea60d33076fcba6ced75a2e5b)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5563488 (root onOpenSearch:gl injection)

/**
 * The shipped sidebar search control opens the already-mounted command
 * palette synchronously. Root state owns the destination; this leaf carries
 * only the native button/key activation contract and therefore has no async
 * subscription or disposal work of its own.
 */
export interface SidebarSearchTriggerActions {
  openSearch(): void;
}

export interface SidebarSearchKeyEvent {
  readonly key: string;
  readonly defaultPrevented: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export const SIDEBAR_SEARCH_TRIGGER = {
  ariaLabel: "Search",
  className: "sand-agents-sidebar__search",
  icon: "search",
  label: "Search",
} as const;

export interface SidebarSearchTrigger {
  onClick(): void;
  onKeyDown(event: SidebarSearchKeyEvent): void;
}

export function createSidebarSearchTrigger(actions: SidebarSearchTriggerActions): SidebarSearchTrigger {
  return {
    onClick: actions.openSearch,
    onKeyDown(event) {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.stopPropagation();
        return;
      }
      if (
        event.defaultPrevented ||
        event.key.length !== 1 ||
        event.key === " " ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      actions.openSearch();
    },
  };
}
