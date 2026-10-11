import { useState } from "react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useChats } from "../../data/hooks/useChats.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Button, TextArea, TextField } from "../../primitives/index.ts";
import { toAppApiError } from "../../data/types.ts";
import { MemberChecklist } from "./MemberChecklist.tsx";
import { toggleMember, validateRoomForm } from "./room-form.ts";
import type { RoomFormState } from "./room-form.ts";
import styles from "./NewDialog.module.css";

export function NewRoomForm() {
  const { client } = useStoreContext();
  const { setActiveChatId } = useActiveChat();
  const chats = useChats();
  const dialogHost = useDialogHost();
  const { t } = useT();

  const [state, setState] = useState<RoomFormState>({ name: "", goal: "", memberIds: [] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bots = chats.filter((chat) => chat.kind === "bot");
  const validation = validateRoomForm(state);

  async function submit() {
    if (!validation.canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { chat } = await client.call("room.create", {
        name: state.name.trim(),
        description: state.goal.trim().length > 0 ? state.goal.trim() : undefined,
        memberIds: state.memberIds,
        requestId: crypto.randomUUID(),
      });
      setActiveChatId(chat.id);
      dialogHost.close();
    } catch (err) {
      setError(toAppApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles["hb-form"]}>
      <TextField label={t("dialogs.new.roomName")} placeholder={t("dialogs.new.roomNamePlaceholder")} value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} />
      <TextArea label={t("dialogs.new.goal")} placeholder={t("dialogs.new.goalPlaceholder")} value={state.goal} onChange={(event) => setState({ ...state, goal: event.target.value })} />
      <MemberChecklist
        label={t("dialogs.new.members")}
        candidates={bots}
        selected={state.memberIds}
        onToggle={(id) => setState({ ...state, memberIds: toggleMember(state.memberIds, id) })}
      />

      {error != null && <div className={styles["hb-form-error"]}>{error}</div>}

      <div className={styles["hb-form-footer"]}>
        <Button type="button" variant="secondary" onClick={dialogHost.close}>
          {t("common.cancel")}
        </Button>
        <Button type="button" variant="primary" disabled={!validation.canSubmit || submitting} onClick={submit}>
          {t("dialogs.new.createRoom")}
        </Button>
      </div>
    </div>
  );
}
