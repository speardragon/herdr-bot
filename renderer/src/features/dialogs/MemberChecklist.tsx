import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import type { ChatSummary } from "../../data/types.ts";
import { Avatar } from "../../primitives/index.ts";
import { canToggleMember, MAX_ROOM_MEMBERS } from "./room-form.ts";
import styles from "./MemberChecklist.module.css";

export interface MemberChecklistProps {
  readonly candidates: readonly ChatSummary[];
  readonly selected: readonly string[];
  readonly onToggle: (chatId: string) => void;
  readonly label: string;
  readonly max?: number;
}

/** The bot checklist shared by the New Room form (every existing bot, checkbox + avatar +
 * name + @handle, with a live N/6 counter) and the room info panel's "Add members" step -- no
 * other UI surface exists for post-creation member editing, so this component is reused there as
 * the obvious starting point. */
export function MemberChecklist({ candidates, selected, onToggle, label, max = MAX_ROOM_MEMBERS }: MemberChecklistProps) {
  return (
    <div>
      <div className={styles["hb-members-header"]}>
        <span>{label}</span>
        <span className={styles["hb-members-counter"]}>
          {selected.length}/{max}
        </span>
      </div>
      <div className={styles["hb-members-list"]}>
        {candidates.map((chat) => {
          const checked = selected.includes(chat.id);
          const disabled = !canToggleMember(selected, chat.id, max);
          return (
            <div key={chat.id} className={styles["hb-members-row"]}>
              <label>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(chat.id)} />
                <Avatar kind="bot" color={resolvePersonaColor(chat.avatarColor)} name={chat.name} size="sm" />
                <span className={styles["hb-members-name"]}>{chat.name}</span>
                <span className={styles["hb-members-handle"]}>@{chat.id}</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
