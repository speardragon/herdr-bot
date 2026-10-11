import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useChat } from "../../data/hooks/useChat.ts";
import { useShortcut } from "../../shell/ShortcutsProvider.tsx";
import { useDialogs } from "./useDialogs.tsx";

/**
 * Mounted once by `App.tsx`. Owns the global ⌘N (new), ⌘, (settings), and ⌘I (toggle info panel for the
 * active chat) shortcuts -- the sidebar/header features also call `useDialogs()` directly for their own
 * entry points (row context menu, header click target), this is just the keyboard-only path. Renders
 * nothing itself: every real dialog/panel component lives elsewhere in this folder and is opened through
 * `useDialogs()`.
 */
export function DialogsSlot() {
  const dialogs = useDialogs();
  const { activeChatId } = useActiveChat();
  const activeChat = useChat(activeChatId);

  useShortcut("dialogs.new", "mod+n", () => dialogs.openNewChatMenu());
  useShortcut("dialogs.settings", "mod+,", () => dialogs.openSettings());
  useShortcut("dialogs.info", "mod+i", () => {
    if (activeChat == null) return;
    if (activeChat.kind === "bot") dialogs.openBotInfo(activeChat.id);
    else dialogs.openRoomInfo(activeChat.id);
  });

  return null;
}
