import { useCallback, useEffect, useState } from "react";
import { useShortcut } from "./ShortcutsProvider.tsx";
import { SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH_DEFAULT, resolveSidebarDrag, widthForMode } from "./sidebar-width.ts";
import type { SidebarMode } from "./sidebar-width.ts";

const STORAGE_KEY = "herdr-bot.sidebar";

interface Persisted {
  readonly width: number;
  readonly mode: SidebarMode;
}

function readPersisted(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return { width: SIDEBAR_WIDTH_DEFAULT, mode: "expanded" };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const mode: SidebarMode = parsed.mode === "rail" ? "rail" : "expanded";
    const width = typeof parsed.width === "number" ? parsed.width : SIDEBAR_WIDTH_DEFAULT;
    return { width, mode };
  } catch {
    return { width: SIDEBAR_WIDTH_DEFAULT, mode: "expanded" };
  }
}

function writePersisted(value: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // best-effort only
  }
}

export interface SidebarLayout {
  readonly width: number;
  readonly mode: SidebarMode;
  /** Feeds a raw drag width (pointer x minus the row's left edge) into the snap/clamp logic. */
  onDrag(rawWidth: number): void;
  onDragEnd(): void;
  toggleCollapsed(): void;
}

/** Owns the sidebar's resizable width + icon-rail snap, persisted across sessions, and
 * registers the ⌘B toggle shortcut. One instance lives in AppShell; features/sidebar only needs the
 * returned `width`/`mode` plus the drag handlers on its own resize-handle element. */
export function useSidebarLayout(): SidebarLayout {
  const [persisted, setPersisted] = useState<Persisted>(() => readPersisted());
  const [liveWidth, setLiveWidth] = useState<number | null>(null);

  useEffect(() => writePersisted(persisted), [persisted]);

  const onDrag = useCallback((rawWidth: number) => {
    setLiveWidth(rawWidth);
  }, []);

  const onDragEnd = useCallback(() => {
    setLiveWidth((current) => {
      if (current == null) return null;
      const result = resolveSidebarDrag(current);
      // `width` must only ever hold the *expanded* width: snapping into the rail must not clobber it
      // with SIDEBAR_RAIL_WIDTH, or dragging back out past the snap threshold (or a later ⌘B) would
      // restore SIDEBAR_WIDTH_MIN instead of the width the user actually had before collapsing (see
      // `toggleCollapsed`'s own comment -- this is the same bug via the drag path instead of ⌘B).
      setPersisted((prev) => (result.mode === "rail" ? { width: prev.width, mode: "rail" } : { width: result.width, mode: result.mode }));
      return null;
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setPersisted((current) => {
      const nextMode: SidebarMode = current.mode === "rail" ? "expanded" : "rail";
      // Collapsing to rail must not overwrite the persisted *expanded* width with SIDEBAR_RAIL_WIDTH --
      // `width` always means "the width to restore when back in expanded mode"; the rail's own fixed
      // width comes from `mode` alone (see this hook's returned `width` below). Previously this called
      // `widthForMode("rail", ...)` unconditionally, which stored 88 here, so toggling back out via a
      // second ⌘B read that 88 back as `current.width` and clamped it up to SIDEBAR_WIDTH_MIN (220)
      // instead of restoring the actual prior width (e.g. the 280 default).
      const width = nextMode === "rail" ? current.width : widthForMode(nextMode, current.width);
      return { width, mode: nextMode };
    });
  }, []);

  useShortcut("shell.toggleSidebar", "mod+b", toggleCollapsed);

  const width = liveWidth != null ? resolveSidebarDrag(liveWidth).width : widthForMode(persisted.mode, persisted.width);
  const mode = liveWidth != null ? resolveSidebarDrag(liveWidth).mode : persisted.mode;

  return { width: mode === "rail" ? SIDEBAR_RAIL_WIDTH : width, mode, onDrag, onDragEnd, toggleCollapsed };
}
