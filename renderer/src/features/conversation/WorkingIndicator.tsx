import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Avatar } from "../../primitives/index.ts";
import type { ChatSummary } from "../../data/types.ts";
import styles from "./WorkingIndicator.module.css";

export interface WorkingIndicatorProps {
  /** Every currently-working bot to show a row for -- one bot (itself) for a DM, zero or more room
   * members for a room. Empty renders nothing. */
  readonly workingBots: readonly ChatSummary[];
}

/** The "`<Name>` is working" row pinned to the bottom of the transcript while a bot's turn is running.
 * There is no token-stream/typing-vs-running distinction available -- only
 * the coarse `isRunning`/`currentActivity` signal exists -- just the one animated-ellipsis state. */
export function WorkingIndicator({ workingBots }: WorkingIndicatorProps) {
  const { t } = useT();
  if (workingBots.length === 0) return null;
  return (
    <div className={styles["hb-working"]}>
      {workingBots.map((bot) => (
        <div key={bot.id} className={styles["hb-working-row"]}>
          <Avatar kind="bot" color={resolvePersonaColor(bot.avatarColor)} name={bot.name} size="xs" />
          <span>{t("conversation.working", { name: bot.name })}</span>
          <span className={styles["hb-working-dots"]} aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </div>
      ))}
    </div>
  );
}
