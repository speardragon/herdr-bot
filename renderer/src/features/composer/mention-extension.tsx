/**
 * The inserted mention chip: the mentioned bot's avatar and its name in bold, inline, no pill. Extends the stock `@tiptap/extension-mention` node with an `everyone` attr (the
 * "@everyone" pseudo-mention gets a people-group icon instead of a bot avatar) and a React node view so
 * the chip always shows the bot's CURRENT avatar/name -- looked up live via `useChat(id)` every render,
 * never a snapshot frozen at the moment the mention was typed. A bot renamed or recolored after this
 * message was composed (but before it's sent, or forever after if the message is only a local draft)
 * still shows correctly; a bot that's since been deleted falls back to the label stored on the node.
 */
import { Mention } from "@tiptap/extension-mention";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Users } from "lucide-react";
import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import { useChat } from "../../data/hooks/useChat.ts";
import { Avatar } from "../../primitives/Avatar.tsx";
import styles from "./MentionChip.module.css";

function MentionChipView({ node }: NodeViewProps) {
  const attrs = node.attrs as { readonly id?: unknown; readonly label?: unknown; readonly everyone?: unknown };
  const id = typeof attrs.id === "string" ? attrs.id : "";
  const storedLabel = typeof attrs.label === "string" ? attrs.label : "";
  const everyone = attrs.everyone === true;
  const chat = useChat(everyone ? null : id);
  const displayName = everyone ? "everyone" : (chat?.name ?? storedLabel);

  return (
    <NodeViewWrapper as="span" className={styles["hb-mention-chip"]} contentEditable={false} data-testid="composer-mention-chip">
      <span className={styles["hb-mention-chip-icon"]} aria-hidden>
        {everyone ? <Users size={14} /> : <Avatar kind="bot" size="2xs" color={resolvePersonaColor(chat?.avatarColor)} name={displayName} />}
      </span>
      <span>{everyone ? "everyone" : displayName}</span>
    </NodeViewWrapper>
  );
}

export const ComposerMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      everyone: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-everyone") === "true",
        renderHTML: (attributes: { readonly everyone?: boolean }) => (attributes.everyone ? { "data-everyone": "true" } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(MentionChipView);
  },
});
