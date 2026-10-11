import { useCallback, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Menu } from "./Menu.tsx";

export interface ContextMenuState {
  readonly open: boolean;
  readonly point: { readonly x: number; readonly y: number };
  readonly openAt: (event: MouseEvent) => void;
  readonly close: () => void;
}

/** `onContextMenu={state.openAt}` on a sidebar row + `<ContextMenu state={state}>...</ContextMenu>` for
 * its content -- the sidebar row's right-click menu (Pin/Rename/Edit Profile/Delete). */
export function useContextMenu(): ContextMenuState {
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);

  const openAt = useCallback((event: MouseEvent) => {
    event.preventDefault();
    setPoint({ x: event.clientX, y: event.clientY });
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  return { open, point, openAt, close };
}

export function ContextMenu({ state, children, label }: { readonly state: ContextMenuState; readonly children: ReactNode; readonly label: string }) {
  return (
    <Menu open={state.open} onClose={state.close} anchor={{ kind: "point", x: state.point.x, y: state.point.y }} aria-label={label}>
      {children}
    </Menu>
  );
}
