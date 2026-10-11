import { useState } from "react";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Popover } from "../../primitives/index.ts";
import type { PopoverAnchor } from "../../primitives/index.ts";
import styles from "./ReactionPicker.module.css";

/** The quick-pick row: a 6-emoji quick-pick row, plus a "More emoji" button. There is
 * no emoji catalog from the host (`reactToMessage` accepts any string) -- both rows below
 * are a plain UI-owned static list, not host data. */
const QUICK_EMOJI = ["👍", "👎", "❤️", "😂", "🎉", "😮"];
const MORE_EMOJI = ["🙏", "👀", "🔥", "✅", "🚀", "💯", "😅", "🤔", "👏", "🙌", "😢", "😡", "🤯", "✨", "🫡", "🧠", "🐛", "🛠️", "📎", "🧪"];

export interface ReactionPickerProps {
  readonly open: boolean;
  readonly anchor: PopoverAnchor;
  readonly onClose: () => void;
  readonly onPick: (emoji: string) => void;
}

export function ReactionPicker({ open, anchor, onClose, onPick }: ReactionPickerProps) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);

  if (!open) return null;

  function pick(emoji: string) {
    onPick(emoji);
    onClose();
  }

  return (
    <Popover open={open} anchor={anchor} onClose={onClose} aria-label={t("conversation.addReaction")}>
      <div className={styles["hb-reaction-picker"]}>
        <div className={styles["hb-reaction-picker-row"]}>
          {QUICK_EMOJI.map((emoji) => (
            <button key={emoji} type="button" className={styles["hb-reaction-picker-emoji"]} onClick={() => pick(emoji)}>
              {emoji}
            </button>
          ))}
          {!expanded && (
            <button type="button" className={styles["hb-reaction-picker-more"]} onClick={() => setExpanded(true)}>
              {t("conversation.moreEmoji")}
            </button>
          )}
        </div>
        {expanded && (
          <div className={styles["hb-reaction-picker-grid"]}>
            {MORE_EMOJI.map((emoji) => (
              <button key={emoji} type="button" className={styles["hb-reaction-picker-emoji"]} onClick={() => pick(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </Popover>
  );
}
