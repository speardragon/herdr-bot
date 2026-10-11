import { ExternalLink } from "lucide-react";
import { useChat, useChatMembers } from "../../data/hooks/useChat.ts";
import { useStatus } from "../../data/hooks/useStatus.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { useInfoPanel } from "../../shell/PanelHost.tsx";
import { Avatar, IconButton } from "../../primitives/index.ts";
import { useDialogs } from "../dialogs/useDialogs.tsx";
import { dmHeaderPhrase, workingOnlyPresence } from "./header-status.ts";
import { PresenceStrip } from "./PresenceStrip.tsx";
import styles from "./ConversationSlot.module.css";

export interface HeaderSlotProps {
  readonly chatId: string;
}

/**
 * Chat header + (room-only) presence strip. Resolved here (see header-status.ts's module doc): neither a
 * bot DM nor a room header subtitle ever shows "needs approval" -- only "working".
 */
export function HeaderSlot({ chatId }: HeaderSlotProps) {
  const chat = useChat(chatId);
  const members = useChatMembers(chat);
  const status = useStatus(chat);
  const { client } = useStoreContext();
  const { t } = useT();
  const infoPanel = useInfoPanel();
  const dialogs = useDialogs();

  if (chat == null) return null;

  const subtitle =
    chat.kind === "bot"
      ? dmHeaderPhrase(status.phrase) === "working"
        ? t("conversation.status.selfWorking")
        : null
      : (() => {
          const working = workingOnlyPresence(status.presence);
          return working.length > 0 ? working.map((member) => t("conversation.status.working", { name: member.name })).join(" · ") : null;
        })();

  function openInfoPanel() {
    if (infoPanel.isOpen) {
      infoPanel.close();
      return;
    }
    if (chat!.kind === "bot") dialogs.openBotInfo(chat!.id);
    else dialogs.openRoomInfo(chat!.id);
  }

  return (
    <>
      <div className={styles["hb-conversation-header-row"]}>
        <div className={styles["hb-conversation-header"]} role="button" tabIndex={0} aria-label={t("conversation.viewSettings")} onClick={openInfoPanel} onKeyDown={(event) => event.key === "Enter" && openInfoPanel()}>
          {chat.kind === "bot" ? (
            <Avatar kind="bot" color={resolvePersonaColor(chat.avatarColor)} name={chat.name} size="sm" />
          ) : (
            <Avatar kind="room" members={members.map((member) => ({ color: resolvePersonaColor(member.avatarColor), name: member.name }))} size="sm" />
          )}
          <span className={styles["hb-conversation-title"]}>{chat.name}</span>
          {subtitle != null && <span className={styles["hb-conversation-subtitle"]}>{subtitle}</span>}
        </div>
        {chat.kind === "bot" && (
          <div className={styles["hb-conversation-header-actions"]}>
            <IconButton size="sm" aria-label={t("conversation.openInHerdr")} onClick={() => void client.call("bot.focus", { botId: chat.id })}>
              <ExternalLink size={16} />
            </IconButton>
          </div>
        )}
      </div>
      {chat.kind === "room" && <PresenceStrip members={members} presence={status.presence} />}
    </>
  );
}
