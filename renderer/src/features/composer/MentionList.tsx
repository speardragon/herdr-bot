/**
 * The @-mention autocomplete popover's row list. Mounted imperatively by
 * `mention-suggestion.ts` through Tiptap's `ReactRenderer` (the `@tiptap/suggestion` lifecycle --
 * onStart/onUpdate/onKeyDown/onExit -- isn't hook-shaped, so this component exposes its keyboard
 * handling through a ref rather than owning its own event listeners; see that file for the positioning
 * and mount/unmount side of this).
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Users } from "lucide-react";
import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import { Avatar } from "../../primitives/Avatar.tsx";
import { EVERYONE_MENTION_ID } from "./mention-candidates.ts";
import type { MentionCandidate } from "./mention-candidates.ts";
import styles from "./MentionList.module.css";

export interface MentionInsert {
  readonly id: string;
  readonly label: string;
  readonly everyone: boolean;
}

export interface MentionListProps {
  readonly items: readonly MentionCandidate[];
  readonly command: (item: MentionInsert) => void;
}

export interface MentionListHandle {
  /** Returns `true` when this key was consumed (the suggestion plugin then swallows it); `false` lets
   * it fall through to the composer's normal handling (e.g. a bare Enter with no match sends instead). */
  onKeyDown(args: { readonly event: KeyboardEvent }): boolean;
}

export const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList({ items, command }, ref) {
  const [selected, setSelected] = useState(0);

  // The filtered set changes on every keystroke after `@` -- always re-highlight the first row rather
  // than keeping a now-possibly-out-of-range index, since Enter selects the highlighted (first) row.
  useEffect(() => setSelected(0), [items]);

  function selectIndex(index: number): boolean {
    const item = items[index];
    if (item == null) return false;
    command({ id: item.id, label: item.everyone ? EVERYONE_MENTION_ID : item.label, everyone: item.everyone });
    return true;
  }

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setSelected((current) => (current + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((current) => (current - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        return selectIndex(selected);
      }
      return false;
    },
  }));

  if (items.length === 0) return <div className={styles["hb-mention-list"]} role="listbox" />;

  return (
    <div className={styles["hb-mention-list"]} role="listbox" aria-label="Mentions">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selected}
          className={`${styles["hb-mention-list-item"]} ${index === selected ? styles["hb-mention-list-item--active"] : ""}`}
          onMouseEnter={() => setSelected(index)}
          onClick={() => selectIndex(index)}
        >
          <span className={styles["hb-mention-list-icon"]}>
            {item.everyone ? <Users size={16} aria-hidden /> : <Avatar kind="bot" size="xs" color={resolvePersonaColor(item.avatarColor)} name={item.label} />}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
});
