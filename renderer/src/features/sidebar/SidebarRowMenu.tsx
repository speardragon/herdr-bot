import { ExternalLink, EyeOff, Eye, Pencil, Pin, PinOff, SquarePen, Trash2 } from "lucide-react";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import type { ChatSummary } from "../../data/types.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { ContextMenu, MenuItem, useToast } from "../../primitives/index.ts";
import type { ContextMenuState } from "../../primitives/index.ts";
import { useDialogs } from "../dialogs/useDialogs.tsx";

export interface SidebarRowMenuProps {
  readonly chat: ChatSummary;
  readonly state: ContextMenuState;
  readonly isPinned: boolean;
  readonly onTogglePin: () => void;
  readonly onStartRename: () => void;
}

/** The sidebar row's right-click menu: Pin / Rename Bot|Rename group / Edit Profile / Delete,
 * plus two of this app's own additions -- "Hide from sidebar" (a real host RPC, `chat.setHidden`, with
 * no other UI surface anywhere in the app) and "Open in herdr" for a bot via
 * `bot.focus`. Edit Profile and Delete route through `useDialogs()` -- the real bot/room info panel and
 * delete confirmation `features/dialogs` owns -- rather than anything built locally in this folder. */
export function SidebarRowMenu({ chat, state, isPinned, onTogglePin, onStartRename }: SidebarRowMenuProps) {
  const { t } = useT();
  const { client } = useStoreContext();
  const dialogs = useDialogs();
  const toast = useToast();

  function toggleHidden() {
    void client.call("chat.setHidden", { chatId: chat.id, isHidden: !chat.isHiddenFromSidebar });
    state.close();
  }

  function openEditProfile() {
    state.close();
    if (chat.kind === "bot") dialogs.openBotInfo(chat.id);
    else dialogs.openRoomInfo(chat.id);
  }

  function openDelete() {
    state.close();
    dialogs.confirmDelete({ id: chat.id, name: chat.name });
  }

  function openInHerdr() {
    state.close();
    client.call("bot.focus", { botId: chat.id }).catch((error: unknown) => {
      toast.show(t("sidebar.contextMenu.openInHerdrFailed", { message: error instanceof Error ? error.message : String(error) }));
    });
  }

  return (
    <ContextMenu state={state} label={t(chat.kind === "bot" ? "sidebar.contextMenu.renameBot" : "sidebar.contextMenu.renameRoom")}>
      <MenuItem
        icon={isPinned ? <PinOff size={16} /> : <Pin size={16} />}
        onSelect={() => {
          onTogglePin();
          state.close();
        }}
      >
        {t(isPinned ? "sidebar.contextMenu.unpin" : "sidebar.contextMenu.pin")}
      </MenuItem>
      <MenuItem
        icon={<SquarePen size={16} />}
        onSelect={() => {
          state.close();
          onStartRename();
        }}
      >
        {t(chat.kind === "bot" ? "sidebar.contextMenu.renameBot" : "sidebar.contextMenu.renameRoom")}
      </MenuItem>
      <MenuItem icon={<Pencil size={16} />} onSelect={openEditProfile}>
        {t("sidebar.contextMenu.editProfile")}
      </MenuItem>
      <MenuItem icon={chat.isHiddenFromSidebar ? <Eye size={16} /> : <EyeOff size={16} />} onSelect={toggleHidden}>
        {t(chat.isHiddenFromSidebar ? "sidebar.contextMenu.show" : "sidebar.contextMenu.hide")}
      </MenuItem>
      {chat.kind === "bot" && (
        <MenuItem icon={<ExternalLink size={16} />} onSelect={openInHerdr}>
          {t("sidebar.contextMenu.openInHerdr")}
        </MenuItem>
      )}
      <MenuItem icon={<Trash2 size={16} />} danger onSelect={openDelete}>
        {t("sidebar.contextMenu.delete")}
      </MenuItem>
    </ContextMenu>
  );
}
