import { useEffect, useRef, useSyncExternalStore } from "react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useInfoPanel } from "../../shell/PanelHost.tsx";
import { BotInfoPanel } from "./BotInfoPanel.tsx";
import { clearPanelRequest, dialogsStore } from "./dialogs-store.ts";
import { RoomInfoPanel } from "./RoomInfoPanel.tsx";

/**
 * Bridges `dialogs-store`'s `panelRequest` to a real `useInfoPanel().open(...)` call. Exists because
 * `PanelHost` (`shell/PanelHost.tsx`) only wraps the main column -- a sidebar row's "Edit Profile" or a
 * palette action can't call `useInfoPanel()` directly without being a descendant of it, so
 * `useDialogs().openBotInfo/openRoomInfo` just write to the store instead, and this component (mounted
 * once inside `PanelHost`, see the `shell/AppShell.tsx` edit in this slice's report) is the only thing
 * that turns that into an actual panel open. Renders nothing itself.
 */
export function DialogsPanelSync() {
  const panel = useInfoPanel();
  const request = useSyncExternalStore(dialogsStore.subscribe, () => dialogsStore.getState().panelRequest);
  const { activeChatId } = useActiveChat();

  useEffect(() => {
    if (request == null) return;
    if (request.kind === "bot") panel.open(<BotInfoPanel botId={request.chatId} />);
    else panel.open(<RoomInfoPanel roomId={request.chatId} />);
    clearPanelRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when a new request lands
  }, [request]);

  // The info panel shows one specific chat's settings -- if the user navigates to a different chat
  // (sidebar row, palette jump, ...) while it's open, it must close rather than keep showing the
  // now-unrelated chat's profile next to the new chat's transcript. Skipped on mount (the ref starts
  // equal to the first render's activeChatId) and whenever a request for the *same* switch just opened
  // the panel (opening never changes activeChatId itself, so there's no race between the two effects).
  const prevActiveChatId = useRef(activeChatId);
  useEffect(() => {
    if (prevActiveChatId.current !== activeChatId) panel.close();
    prevActiveChatId.current = activeChatId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- panel.close is stable; only react to the id
  }, [activeChatId]);

  return null;
}
