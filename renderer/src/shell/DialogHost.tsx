import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../i18n/TranslationProvider.tsx";
import { Dialog } from "../primitives/index.ts";

export interface DialogHandle {
  /** Mounts `node` as the app's single modal dialog. Opening a second one while one is already open
   * replaces it (there is deliberately no stack -- this app never shows two modals at once). */
  open(node: ReactNode, options?: DialogOptions): void;
  close(): void;
}

export interface DialogOptions {
  readonly title?: string;
  /** A catalog key, translated on every render so the title follows a language switch made while the
   * dialog is open (Settings' own Language control). Wins over `title`. */
  readonly titleKey?: string;
  readonly width?: number;
}

const DialogHostContext = createContext<DialogHandle | null>(null);

/** The extension point the dialogs/panels feature builds against: any feature calls
 * `useDialogHost().open(<NewBotDialog .../>)` from anywhere (a shortcut handler, a sidebar menu item, a
 * command palette action) without the shell knowing that dialog exists. Mount once near the app root. */
export function DialogHost({ children }: { readonly children: ReactNode }) {
  const { t } = useT();
  const [state, setState] = useState<{ readonly node: ReactNode; readonly options: DialogOptions } | null>(null);

  const close = useCallback(() => setState(null), []);
  const open = useCallback<DialogHandle["open"]>((node, options) => {
    setState({ node, options: options ?? {} });
  }, []);

  const handle = useMemo<DialogHandle>(() => ({ open, close }), [open, close]);

  return (
    <DialogHostContext.Provider value={handle}>
      {children}
      <Dialog open={state != null} onClose={close} title={state?.options.titleKey != null ? t(state.options.titleKey) : state?.options.title} width={state?.options.width} closeLabel={t("common.close")}>
        {state?.node}
      </Dialog>
    </DialogHostContext.Provider>
  );
}

export function useDialogHost(): DialogHandle {
  const handle = useContext(DialogHostContext);
  if (handle == null) throw new Error("useDialogHost() called outside <DialogHost>");
  return handle;
}
