import { useCallback, useMemo } from "react";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog.tsx";
import { openNewMenu, requestPanel } from "./dialogs-store.ts";
import { NewDialog } from "./NewDialog.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";

export interface DialogsApi {
  /** Opens the "+" quick-create landing in the main column. */
  openNewChatMenu(): void;
  /** Opens the Advanced New dialog straight to its Bot tab, skipping the quick-create landing. */
  openNewBotDialog(): void;
  /** Opens the Advanced New dialog straight to its Room tab. */
  openNewRoomDialog(): void;
  openSettings(): void;
  /** Safe to call from anywhere, including outside the main column (a sidebar row's context menu, a
   * palette action) -- routes through `dialogs-store.ts` rather than `useInfoPanel()` directly, since
   * `PanelHost` only wraps the main column. */
  openBotInfo(chatId: string): void;
  openRoomInfo(chatId: string): void;
  confirmDelete(chat: { readonly id: string; readonly name: string }): void;
}

/**
 * The entry-point surface every other feature calls to reach this folder's dialogs/panels (see this
 * folder's README). Nothing here needs `PanelHost`/`DialogHost` to be an ancestor of
 * the *caller* except `DialogHost`, which already wraps the whole app (see `app/App.tsx`).
 */
export function useDialogs(): DialogsApi {
  const dialogHost = useDialogHost();
  const { t } = useT();

  const openNewChatMenu = useCallback(() => openNewMenu(), []);
  const openNewBotDialog = useCallback(() => dialogHost.open(<NewDialog initialTab="bot" />, { titleKey: "dialogs.new.title" }), [dialogHost, t]);
  const openNewRoomDialog = useCallback(() => dialogHost.open(<NewDialog initialTab="room" />, { titleKey: "dialogs.new.title" }), [dialogHost, t]);
  const openSettings = useCallback(() => dialogHost.open(<SettingsDialog />, { titleKey: "dialogs.settings.title" }), [dialogHost, t]);
  const openBotInfo = useCallback((chatId: string) => requestPanel("bot", chatId), []);
  const openRoomInfo = useCallback((chatId: string) => requestPanel("room", chatId), []);
  const confirmDelete = useCallback((chat: { readonly id: string; readonly name: string }) => dialogHost.open(<DeleteConfirmDialog chatId={chat.id} name={chat.name} />, {}), [dialogHost]);

  return useMemo(
    () => ({ openNewChatMenu, openNewBotDialog, openNewRoomDialog, openSettings, openBotInfo, openRoomInfo, confirmDelete }),
    [openNewChatMenu, openNewBotDialog, openNewRoomDialog, openSettings, openBotInfo, openRoomInfo, confirmDelete],
  );
}
