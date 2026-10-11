import { useState } from "react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { DEFAULT_PERSONA_COLOR } from "../../data/avatar-colors.ts";
import type { PersonaColor } from "../../data/avatar-colors.ts";
import { toAppApiError } from "../../data/types.ts";
import { Avatar, Button, TextField } from "../../primitives/index.ts";
import { ColorSwatches } from "./ColorSwatches.tsx";
import styles from "./QuickCreateBot.module.css";

export interface QuickCreateBotProps {
  /** Two lines of explainer copy shown only in the empty-roster onboarding screen, not in
   * the "+" menu's quick-create action. */
  readonly showExplainer?: boolean;
  readonly onAdvanced: () => void;
  /** Called once the bot is created and activated -- e.g. to close the "+" menu it was opened from. */
  readonly onDone?: () => void;
}

/** The quick-create flow: color + name + Start, backed by `bot.quickCreate`. The exact same flow as the
 * sidebar's "+" button. Shared by the onboarding empty state and the "+"
 * menu's "Create a new Bot" action. */
export function QuickCreateBot({ showExplainer = false, onAdvanced, onDone }: QuickCreateBotProps) {
  const { client } = useStoreContext();
  const { setActiveChatId } = useActiveChat();
  const { t, locale } = useT();
  const [color, setColor] = useState<PersonaColor>(DEFAULT_PERSONA_COLOR);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { chat } = await client.call("bot.quickCreate", {
        requestId: crypto.randomUUID(),
        locale,
        name: name.trim().length > 0 ? name.trim() : undefined,
        avatarColor: color,
      });
      setActiveChatId(chat.id);
      onDone?.();
    } catch (err) {
      setError(toAppApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const previewName = name.trim().length > 0 ? name : t("dialogs.onboarding.namePlaceholder");

  return (
    <>
      <div className={styles["hb-quick-create-header"]}>
        <Avatar kind="bot" color={color} name={previewName} size="sm" />
        <span className={styles["hb-quick-create-header-title"]}>{previewName}</span>
      </div>
      <div className={styles["hb-quick-create"]}>
        {showExplainer && (
          <div className={styles["hb-quick-create-explainer"]}>
            <p>{t("dialogs.onboarding.explainer1")}</p>
            <p>{t("dialogs.onboarding.explainer2")}</p>
          </div>
        )}
        <Avatar kind="bot" color={color} name={previewName} size="xl" />
        <ColorSwatches value={color} onChange={setColor} aria-label={t("dialogs.botInfo.changeColor")} />
        <div className={styles["hb-quick-create-field"]}>
          <TextField label={t("dialogs.new.name")} placeholder={t("dialogs.onboarding.namePlaceholder")} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        {error != null && <div className={styles["hb-quick-create-error"]}>{error}</div>}
        <div className={styles["hb-quick-create-start"]}>
          <Button variant="primary" size="lg" disabled={busy} onClick={start}>
            {t("dialogs.onboarding.start")}
          </Button>
        </div>
        <button type="button" className={styles["hb-quick-create-advanced"]} onClick={onAdvanced}>
          {t("dialogs.onboarding.advancedSetup")}
        </button>
      </div>
    </>
  );
}
