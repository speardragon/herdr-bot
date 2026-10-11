import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Badge } from "../../primitives/index.ts";
import { groupReactions } from "./entry-shapes.ts";
import type { EntryReaction } from "./entry-shapes.ts";
import styles from "./Reactions.module.css";

export interface ReactionsProps {
  readonly chatId: string;
  readonly entryId: string;
  readonly reactions: readonly EntryReaction[];
  readonly align: "start" | "end";
}

/** The reaction pill row directly under a message bubble: emoji + count, mine
 * highlighted. Clicking a pill toggles your own reaction for that emoji (`message.react` toggles,
 * per docs/app-api.md) -- its `aria-label` says so too. */
export function Reactions({ chatId, entryId, reactions, align }: ReactionsProps) {
  const { client } = useStoreContext();
  const { t } = useT();
  const groups = groupReactions(reactions);
  if (groups.length === 0) return null;

  return (
    <div className={styles["hb-reactions"]} style={{ justifyContent: align === "end" ? "flex-end" : "flex-start" }}>
      {groups.map((group) => (
        <Badge
          key={group.emoji}
          as="button"
          tone={group.mine ? "accent-mine" : "accent"}
          aria-label={t("conversation.reactedAriaLabel", { emoji: group.emoji })}
          onClick={() => void client.call("message.react", { chatId, entryId, emoji: group.emoji })}
        >
          {group.emoji} {group.count}
        </Badge>
      ))}
    </div>
  );
}
