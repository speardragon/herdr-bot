import { useState } from "react";
import { useChats } from "../../data/hooks/useChats.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Button } from "../../primitives/index.ts";
import { toAppApiError } from "../../data/types.ts";
import { MemberChecklist } from "./MemberChecklist.tsx";
import { MAX_ROOM_MEMBERS, toggleMember } from "./room-form.ts";
import styles from "./NewDialog.module.css";

export interface AddMembersDialogProps {
  readonly roomId: string;
  readonly currentMemberIds: readonly string[];
}

/**
 * Room info's "Add" step: no UI surface exists elsewhere for post-creation member editing despite
 * `room.setMembers` existing, so this reuses the creation form's checklist component pre-unchecked for
 * every bot not already a member. Confirming calls `room.setMembers` with the union of current +
 * newly-picked members.
 */
export function AddMembersDialog({ roomId, currentMemberIds }: AddMembersDialogProps) {
  const chats = useChats();
  const { client } = useStoreContext();
  const dialogHost = useDialogHost();
  const { t } = useT();

  const [toAdd, setToAdd] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = chats.filter((chat) => chat.kind === "bot" && !currentMemberIds.includes(chat.id));
  const remainingCapacity = Math.max(0, MAX_ROOM_MEMBERS - currentMemberIds.length);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await client.call("room.setMembers", { roomId, memberIds: [...currentMemberIds, ...toAdd] });
      dialogHost.close();
    } catch (err) {
      setError(toAppApiError(err).message);
      setBusy(false);
    }
  }

  return (
    <div className={styles["hb-form"]}>
      <MemberChecklist label={t("dialogs.new.members")} candidates={candidates} selected={toAdd} onToggle={(id) => setToAdd(toggleMember(toAdd, id, remainingCapacity))} max={remainingCapacity} />
      {error != null && <div className={styles["hb-form-error"]}>{error}</div>}
      <div className={styles["hb-form-footer"]}>
        <Button variant="secondary" onClick={dialogHost.close}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={busy || toAdd.length === 0} onClick={confirm}>
          {t("dialogs.roomInfo.addMembersConfirm")}
        </Button>
      </div>
    </div>
  );
}
