import { Users } from "lucide-react";
import { useChats } from "../../data/hooks/useChats.ts";
import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Avatar } from "../../primitives/index.ts";
import styles from "./MentionChip.module.css";

export interface MentionChipProps {
  /** `null` for the synthesized "@everyone" mention. */
  readonly id: string | null;
  readonly name: string;
}

/** An inline `@Name` pill, rendered identically while composing and once sent. Resolves
 * the mentioned bot's *current* avatar live from the chat list on every render -- never from anything
 * frozen into the message itself -- so a renamed/recolored bot's older mentions still show up to date. */
export function MentionChip({ id, name }: MentionChipProps) {
  const chats = useChats();
  const { t } = useT();

  if (id == null) {
    return (
      <span className={styles["hb-mention"]}>
        <Users size={12} aria-hidden />
        {t("conversation.everyone")}
      </span>
    );
  }

  const bot = chats.find((chat) => chat.id === id);
  return (
    <span className={styles["hb-mention"]}>
      {bot != null ? <Avatar kind="bot" color={resolvePersonaColor(bot.avatarColor)} name={bot.name} size="xs" /> : null}
      {bot?.name ?? name}
    </span>
  );
}
