import { useRef, useState } from "react";
import { MessageSquarePlus, MoreHorizontal, Reply, SmilePlus } from "lucide-react";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { IconButton, Menu, MenuItem } from "../../primitives/index.ts";
import { setReplyTarget } from "../../data/reply-target.ts";
import { ReactionPicker } from "./ReactionPicker.tsx";
import styles from "./HoverActions.module.css";

export interface HoverActionsProps {
  readonly chatId: string;
  readonly entryId: string;
  readonly authorName: string;
  /** Plain-text (already markdown-stripped-ish is fine, a raw preview is good enough) preview for the
   * composer's quote strip and for "Copy". */
  readonly previewText: string;
  /** Whose message this is -- picks between the two aria-label variants ("Reply to
   * Agent message" / "Reply to your message"). */
  readonly isMine: boolean;
  /** Whether the owning row is currently hovered/focused -- visibility is driven from here rather than a
   * CSS `:hover` on this subtree directly, since a popover opened from inside it portals to
   * `document.body` and would otherwise fall outside any `:hover`-based reveal the moment the pointer
   * moves onto the popover itself. */
  readonly hovered: boolean;
}

/** The floating 3-icon toolbar revealed on hover over a message bubble: react, reply, and a
 * "more" menu (Start a thread / Copy). Visibility is pure CSS (`:hover`/`:focus-within` in the row's own
 * stylesheet) -- this component only owns the popovers' open/closed state. */
export function HoverActions({ chatId, entryId, authorName, previewText, isMine, hovered }: HoverActionsProps) {
  const { client } = useStoreContext();
  const { t } = useT();
  // `IconButton` doesn't forward a ref, so each trigger is wrapped in a plain anchor span instead of
  // reaching into the primitive -- the popover anchors to the span's (practically identical) rect.
  const reactButtonRef = useRef<HTMLSpanElement>(null);
  const moreButtonRef = useRef<HTMLSpanElement>(null);
  const [openPopover, setOpenPopover] = useState<"react" | "more" | null>(null);

  function reply() {
    setReplyTarget(chatId, { entryId, authorName, preview: previewText });
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(previewText);
    } catch {
      // Best-effort convenience action -- see MarkdownView's code-block copy for the same tolerance.
    }
  }

  const visible = hovered || openPopover != null;

  return (
    <div className={`${styles["hb-hover-actions"]} ${visible ? styles["hb-hover-actions--visible"] : ""}`}>
      <span ref={reactButtonRef} className={styles["hb-hover-actions-anchor"]}>
        <IconButton size="sm" aria-label={t("conversation.addReaction")} onClick={() => setOpenPopover("react")}>
          <SmilePlus size={15} />
        </IconButton>
      </span>
      <IconButton size="sm" aria-label={t(isMine ? "conversation.replyToYou" : "conversation.replyToAgent")} onClick={reply}>
        <Reply size={15} />
      </IconButton>
      <span ref={moreButtonRef} className={styles["hb-hover-actions-anchor"]}>
        <IconButton size="sm" aria-label={t("conversation.moreActions")} onClick={() => setOpenPopover("more")}>
          <MoreHorizontal size={15} />
        </IconButton>
      </span>

      {reactButtonRef.current != null && (
        <ReactionPicker
          open={openPopover === "react"}
          anchor={{ kind: "element", element: reactButtonRef.current, placement: "bottom-end" }}
          onClose={() => setOpenPopover(null)}
          onPick={(emoji) => void client.call("message.react", { chatId, entryId, emoji })}
        />
      )}
      {moreButtonRef.current != null && (
        <Menu open={openPopover === "more"} onClose={() => setOpenPopover(null)} anchor={{ kind: "element", element: moreButtonRef.current, placement: "bottom-end" }} aria-label={t("conversation.moreActions")}>
          <MenuItem
            icon={<MessageSquarePlus size={14} />}
            onSelect={() => {
              setOpenPopover(null);
              void client.call("transcript.thread", { chatId, rootId: entryId });
            }}
          >
            {t("conversation.startThread")}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setOpenPopover(null);
              void copyText();
            }}
          >
            {t("conversation.copy")}
          </MenuItem>
        </Menu>
      )}
    </div>
  );
}
