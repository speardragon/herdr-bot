import { useT } from "../../i18n/TranslationProvider.tsx";
import styles from "./EmptyChat.module.css";

export function EmptyChat() {
  const { t } = useT();
  return (
    <div className={styles["hb-empty-chat"]}>
      <div className={styles["hb-empty-chat-title"]}>{t("conversation.emptyChat.title")}</div>
      <div className={styles["hb-empty-chat-body"]}>{t("conversation.emptyChat.body")}</div>
    </div>
  );
}
