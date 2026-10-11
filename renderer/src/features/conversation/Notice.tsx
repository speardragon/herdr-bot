import { useChats } from "../../data/hooks/useChats.ts";
import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Avatar } from "../../primitives/index.ts";
import { deriveNoticeView } from "./notice-view.ts";
import type { TranscriptEntry } from "../../data/types.ts";
import styles from "./Notice.module.css";

/** Splits a translated `"...{name}..."` template around the literal placeholder so the target's avatar
 * can be inserted as a real element at the right spot for either locale's word order (English: name
 * after the verb; Korean: name before it) -- `translate()` leaves `{name}` untouched when the vars
 * object doesn't contain that key (see i18n/catalog.ts's `interpolate`), which an empty `{}` satisfies. */
function splitOnNamePlaceholder(template: string): readonly [string, string] {
  const index = template.indexOf("{name}");
  return index === -1 ? [template, ""] : [template.slice(0, index), template.slice(index + "{name}".length)];
}

export interface NoticeProps {
  readonly entry: TranscriptEntry;
}

/** A centered, muted system notice. Structured notices (bot renamed / bot delegated to
 * another chat) are rebuilt from their `event` field through this app's own i18n catalog -- both
 * languages, with the target's current avatar -- rather than showing the host's raw (always-Korean,
 * see notice-view.ts) `content` string; a plain notice with no structured event has nothing to rebuild
 * from and renders verbatim, exactly as the host wrote it. */
export function Notice({ entry }: NoticeProps) {
  const chats = useChats();
  const { t } = useT();
  const view = deriveNoticeView(entry);

  if (view.kind === "renamed") {
    return <div className={styles["hb-notice"]}>{t("conversation.noticeRenamed", { newName: view.newName })}</div>;
  }

  if (view.kind === "delegated") {
    const target = chats.find((chat) => chat.id === view.targetChatId);
    const [before, after] = splitOnNamePlaceholder(t("conversation.noticeDelegated", {}));
    return (
      <div className={styles["hb-notice"]}>
        <span className={styles["hb-notice-delegation"]}>
          {before}
          {target != null && target.kind === "room" ? (
            <Avatar kind="room" members={[]} size="xs" />
          ) : (
            <Avatar kind="bot" color={resolvePersonaColor(target?.avatarColor)} name={target?.name ?? view.targetName} size="xs" />
          )}
          <strong>{target?.name ?? view.targetName}</strong>
          {after}
        </span>
      </div>
    );
  }

  return <div className={styles["hb-notice"]}>{view.text}</div>;
}
