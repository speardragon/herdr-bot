import { useEffect, useState } from "react";
import { ChevronLeft, ChevronsRight, X } from "lucide-react";
import { useChat, useChatMembers } from "../../data/hooks/useChat.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import { useInfoPanel } from "../../shell/PanelHost.tsx";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { toAppApiError } from "../../data/types.ts";
import { Avatar, Button, IconButton, TextArea, TextField } from "../../primitives/index.ts";
import { AddMembersDialog } from "./AddMembersDialog.tsx";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog.tsx";
import { MAX_ROOM_MEMBERS } from "./room-form.ts";
import styles from "./InfoPanel.module.css";

export interface RoomInfoPanelProps {
  readonly roomId: string;
}

/**
 * The room info/settings panel: Name/Description, plus a Members section this folder
 * designed from scratch (`room.setMembers` exists but has no UI surface anywhere else in the app --
 * see this folder's README), and Delete room.
 */
export function RoomInfoPanel({ roomId }: RoomInfoPanelProps) {
  const chat = useChat(roomId);
  const members = useChatMembers(chat);
  const { client } = useStoreContext();
  const panel = useInfoPanel();
  const dialogHost = useDialogHost();
  const { t } = useT();

  const [name, setName] = useState(chat?.name ?? "");
  const [description, setDescription] = useState(chat?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (chat == null) return;
    setName(chat.name);
    setDescription(chat.description);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id]);

  useEffect(() => {
    if (chat == null) panel.close();
  }, [chat, panel]);

  if (chat == null) return null;

  async function saveProfile(patch: { name?: string; description?: string }) {
    try {
      await client.call("chat.updateProfile", { chatId: roomId, ...patch });
    } catch (err) {
      setError(toAppApiError(err).message);
    }
  }

  async function removeMember(memberId: string) {
    try {
      await client.call("room.setMembers", { roomId, memberIds: chat!.memberIds.filter((id) => id !== memberId) });
    } catch (err) {
      setError(toAppApiError(err).message);
    }
  }

  return (
    <div>
      <div className={styles["hb-panel-header"]}>
        <IconButton aria-label={t("common.back")} size="sm" onClick={panel.close}>
          <ChevronLeft size={18} />
        </IconButton>
        <span className={styles["hb-panel-title"]}>{t("dialogs.botInfo.title")}</span>
        <IconButton aria-label={t("dialogs.botInfo.closeDetails")} size="sm" onClick={panel.close}>
          <ChevronsRight size={18} />
        </IconButton>
      </div>

      <div className={styles["hb-panel-body"]}>
        <div className={styles["hb-panel-avatar"]}>
          <Avatar kind="room" members={members.map((member) => ({ color: resolvePersonaColor(member.avatarColor), name: member.name }))} meLabel={t("common.me")} size="xl" />
        </div>

        <TextField label={t("dialogs.new.roomName")} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => name !== chat.name && saveProfile({ name })} />
        <TextArea label={t("dialogs.botInfo.description")} value={description} onChange={(event) => setDescription(event.target.value)} onBlur={() => description !== chat.description && saveProfile({ description })} />

        <div>
          <div className={styles["hb-panel-row"]}>
            <span className={styles["hb-panel-section-header"]} style={{ borderTop: "none", paddingTop: 0 }}>
              {t("dialogs.roomInfo.members")} ({members.length}/{MAX_ROOM_MEMBERS})
            </span>
            <Button variant="secondary" size="sm" disabled={members.length >= MAX_ROOM_MEMBERS} onClick={() => dialogHost.open(<AddMembersDialog roomId={roomId} currentMemberIds={chat.memberIds} />, { titleKey: "dialogs.roomInfo.addMembers" })}>
              {t("dialogs.roomInfo.add")}
            </Button>
          </div>
          {members.map((member) => (
            <div key={member.id} className={styles["hb-panel-row"]} style={{ padding: "8px 0" }}>
              <div className={styles["hb-panel-row"]} style={{ gap: 8 }}>
                <Avatar kind="bot" color={resolvePersonaColor(member.avatarColor)} name={member.name} size="sm" />
                <span>{member.name}</span>
              </div>
              <IconButton aria-label={t("dialogs.roomInfo.removeMember", { name: member.name })} size="sm" onClick={() => removeMember(member.id)}>
                <X size={14} />
              </IconButton>
            </div>
          ))}
        </div>

        {error != null && <div className={styles["hb-panel-error"]}>{error}</div>}

        <div className={styles["hb-panel-footer"]}>
          <div className={styles["hb-panel-full-button"]}>
            <Button variant="danger" onClick={() => dialogHost.open(<DeleteConfirmDialog chatId={roomId} name={chat.name} />, {})}>
              {t("common.delete")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
