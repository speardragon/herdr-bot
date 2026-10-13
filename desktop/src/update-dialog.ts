/**
 * "Check for Updates…" from the menu: checks, then answers with a native dialog -- up to date, failed,
 * or a newer version with "Update and Restart". Installing goes through the same bridge handlers the
 * Settings dialog uses, so both show the same state (the Dock icon shows the download's progress).
 */
import type { BrowserWindow, Dialog } from "electron";
import type { UpdateStatus } from "./desktop-bridge.ts";
import type { UpdateText } from "./app-menu.ts";

type Handler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

export interface MenuUpdateDeps {
  readonly handlers: Record<string, Handler>;
  readonly dialog: Pick<Dialog, "showMessageBox">;
  readonly window: BrowserWindow;
  readonly text: UpdateText;
  readonly openExternal: (url: string) => Promise<void>;
}

async function call(handlers: Record<string, Handler>, method: string): Promise<UpdateStatus> {
  const handler = handlers[method];
  if (handler == null) throw new Error(`no ${method} handler`);
  return (await handler({})) as UpdateStatus;
}

export async function checkForUpdatesFromMenu(deps: MenuUpdateDeps): Promise<void> {
  const { dialog, window, text } = deps;
  const info = (message: string, detail?: string) => dialog.showMessageBox(window, { type: "info", message, ...(detail == null ? {} : { detail }), buttons: [text.ok] });
  const status = await call(deps.handlers, "update.check");
  const state = status.state;
  if (state.type === "downloading" || state.type === "restarting") {
    await info(text.downloading);
    return;
  }
  if (state.type === "idle") {
    if (state.lastCheck?.result === "error") await dialog.showMessageBox(window, { type: "warning", message: text.checkFailed, detail: state.lastCheck.errorMessage ?? "", buttons: [text.ok] });
    else await info(text.upToDate(status.currentVersion));
    return;
  }
  const choice = await dialog.showMessageBox(window, {
    type: "info",
    message: text.available(state.version),
    detail: text.availableDetail(status.currentVersion),
    buttons: [text.updateNow, text.later, text.releaseNotes],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice.response === 2) {
    await deps.openExternal(state.releaseUrl);
    return;
  }
  if (choice.response !== 0) return;
  const result = await call(deps.handlers, "update.install");
  if (result.state.type === "available" && result.state.installError != null) {
    await dialog.showMessageBox(window, { type: "warning", message: text.installFailed, detail: result.state.installError, buttons: [text.ok] });
  }
}
