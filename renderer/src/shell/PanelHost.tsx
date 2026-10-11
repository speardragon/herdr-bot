import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import styles from "./PanelHost.module.css";

export interface PanelHandle {
  /** Slides in `node` from the right edge (the bot/room info panel) -- pushes/shrinks the
   * chat column rather than overlaying it. Opening a second panel replaces the first. */
  open(node: ReactNode): void;
  close(): void;
  readonly isOpen: boolean;
}

const PanelHostContext = createContext<PanelHandle | null>(null);

/** Renders the shell's right-side panel slot (see shell/AppShell.tsx). Extension point for the dialogs
 * feature: a bot/room info panel opens itself with `useInfoPanel().open(<BotInfoPanel .../>)` from the
 * header's click handler, with no shell edits needed on either side. */
export function PanelHost({ children }: { readonly children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);

  const close = useCallback(() => setNode(null), []);
  const open = useCallback((next: ReactNode) => setNode(next), []);

  const handle = useMemo<PanelHandle>(() => ({ open, close, isOpen: node != null }), [open, close, node]);

  return (
    <PanelHostContext.Provider value={handle}>
      {children}
      <aside className={`${styles["hb-panel"]} ${node != null ? styles["hb-panel--open"] : ""}`} aria-hidden={node == null}>
        <div className={styles["hb-panel-inner"]}>{node}</div>
      </aside>
    </PanelHostContext.Provider>
  );
}

export function useInfoPanel(): PanelHandle {
  const handle = useContext(PanelHostContext);
  if (handle == null) throw new Error("useInfoPanel() called outside <PanelHost>");
  return handle;
}
