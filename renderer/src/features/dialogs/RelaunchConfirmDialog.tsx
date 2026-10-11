import { useState } from "react";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Button } from "../../primitives/index.ts";
import styles from "./ConfirmDialog.module.css";

export interface RelaunchConfirmDialogProps {
  readonly name: string;
  /** Performs the actual `bot.updateLaunchSettings` call -- owned by the bot info panel so this dialog
   * stays a pure confirmation shell. Should throw (with a readable `.message`) on failure. */
  readonly onConfirm: () => Promise<void>;
}

/**
 * Confirms before relaunching a bot to apply changed launch settings. Launch-setting changes are not
 * applied silently -- a confirmation step before relaunch is a deliberate choice here.
 */
export function RelaunchConfirmDialog({ name, onConfirm }: RelaunchConfirmDialogProps) {
  const dialogHost = useDialogHost();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      dialogHost.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div>
      <p className={styles["hb-confirm-title"]}>{t("dialogs.relaunch.title", { name })}</p>
      <p className={styles["hb-confirm-body"]}>{t("dialogs.relaunch.body")}</p>
      {error != null && <p className={styles["hb-confirm-body"]}>{error}</p>}
      <div className={styles["hb-confirm-footer"]}>
        <Button variant="secondary" onClick={dialogHost.close}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={busy} onClick={confirm}>
          {t("dialogs.relaunch.confirm")}
        </Button>
      </div>
    </div>
  );
}
