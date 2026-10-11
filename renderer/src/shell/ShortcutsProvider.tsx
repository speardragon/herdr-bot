import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useBridge } from "../data/BridgeContext.tsx";
import { createShortcutRegistry } from "./shortcuts.ts";
import type { ShortcutRegistry } from "./shortcuts.ts";

const ShortcutsContext = createContext<ShortcutRegistry | null>(null);

/** Mounted once at the app root: owns the one global `keydown` listener and dispatches through the
 * pure registry in shortcuts.ts. Any feature slice calls `useShortcut(id, combo, handler)` to add its
 * own global shortcut without touching this file. */
export function ShortcutsProvider({ children }: { readonly children: ReactNode }) {
  const bridge = useBridge();
  const registry = useMemo(() => createShortcutRegistry(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const handled = registry.dispatch(
        { key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey },
        bridge.platform,
      );
      if (handled) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [registry, bridge]);

  return <ShortcutsContext.Provider value={registry}>{children}</ShortcutsContext.Provider>;
}

/** Registers a shortcut for the lifetime of the calling component. `combo` uses `"mod"` for the
 * platform primary modifier -- see shell/shortcuts.ts. */
export function useShortcut(id: string, combo: string, handler: (event: KeyboardEvent) => void): void {
  const registry = useContext(ShortcutsContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (registry == null) throw new Error("useShortcut() called outside <ShortcutsProvider>");
    return registry.register(id, combo, (event) => handlerRef.current(event as KeyboardEvent));
  }, [registry, id, combo]);
}
