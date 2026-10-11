import { useState } from "react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Button } from "../../primitives/index.ts";
import { toAppApiError } from "../../data/types.ts";
import styles from "./ConfirmDialog.module.css";

export interface DeleteConfirmDialogProps {
  readonly chatId: string;
  readonly name: string;
}

/** The delete confirmation: identical wording/shape for a bot or a room, only the quoted
 * name changes. Opened via `useDialogs().confirmDelete(chat)` from the sidebar row menu or either info
 * panel's Delete button. */
export function DeleteConfirmDialog({ chatId, name }: DeleteConfirmDialogProps) {
  const { client } = useStoreContext();
  const { activeChatId, setActiveChatId } = useActiveChat();
  const dialogHost = useDialogHost();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await client.call("chat.delete", { chatIds: [chatId] });
      if (activeChatId === chatId) setActiveChatId(null);
      dialogHost.close();
    } catch (err) {
      setError(toAppApiError(err).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <p className={styles["hb-confirm-title"]}>{t("dialogs.delete.title", { name })}</p>
      <p className={styles["hb-confirm-body"]}>{t("dialogs.delete.body")}</p>
      {error != null && <p className={styles["hb-confirm-body"]}>{error}</p>}
      <div className={styles["hb-confirm-footer"]}>
        <Button variant="secondary" onClick={dialogHost.close}>
          {t("common.cancel")}
        </Button>
        <Button variant="danger" disabled={busy} onClick={confirm}>
          {t("common.delete")}
        </Button>
      </div>
    </div>
  );
}
