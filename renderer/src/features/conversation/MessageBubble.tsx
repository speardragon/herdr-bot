import { useState } from "react";
import { useChats } from "../../data/hooks/useChats.ts";
import { resolvePersonaColor, personaColorVar } from "../../data/avatar-colors.ts";
import { formatClockTime } from "../../data/format-time.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Avatar } from "../../primitives/index.ts";
import type { ChatSummary, TranscriptEntry } from "../../data/types.ts";
import { splitAttachments } from "./attachments.ts";
import { Attachments } from "./Attachments.tsx";
import { getAuthor, getRawText, getReactions, getReplyTo, getRichText, isUserMessage } from "./entry-shapes.ts";
import { HoverActions } from "./HoverActions.tsx";
import { MarkdownView } from "./MarkdownView.tsx";
import { MarkerBadges } from "./MarkerBadges.tsx";
import type { MentionCandidate } from "./mentions.ts";
import { Reactions } from "./Reactions.tsx";
import { ReplyQuote } from "./ReplyQuote.tsx";
import styles from "./MessageBubble.module.css";

export interface MessageBubbleProps {
  readonly chat: ChatSummary;
  readonly entry: TranscriptEntry;
  /** Hide the repeated avatar/name label when grouped with the row above (group-messages.ts). */
  readonly grouped: boolean;
  readonly showAuthorLabel: boolean;
  readonly members: readonly MentionCandidate[];
  readonly entriesById: ReadonlyMap<string, TranscriptEntry>;
}

export function MessageBubble({ chat, entry, grouped, showAuthorLabel, members, entriesById }: MessageBubbleProps) {
  const { locale } = useT();
  const chats = useChats();
  const [hovered, setHovered] = useState(false);

  const mine = isUserMessage(entry);
  const author = getAuthor(entry);
  const rawText = getRawText(entry) ?? "";
  const { text, attachmentPaths } = splitAttachments(rawText);
  const richText = getRichText(entry);
  const reactions = getReactions(entry);
  const replyToId = getReplyTo(entry);
  const quotedEntry = replyToId != null ? (entriesById.get(replyToId) ?? null) : null;

  const authorBot = !mine && author != null ? chats.find((c) => c.id === author.id) : undefined;
  const personaColor = resolvePersonaColor(authorBot?.avatarColor ?? chat.avatarColor);

  return (
    <div
      className={`${styles["hb-message-row"]} ${mine ? styles["hb-message-row--mine"] : styles["hb-message-row--bot"]}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!mine && (
        <div className={styles["hb-message-avatar-slot"]}>{!grouped && <Avatar kind="bot" color={personaColor} name={author?.name ?? ""} size="sm" />}</div>
      )}

      <div className={styles["hb-message-column"]}>
        {!mine && !grouped && showAuthorLabel && (
          <div className={styles["hb-message-author"]} style={{ color: personaColorVar(personaColor) }}>
            {author?.name}
          </div>
        )}

        <MarkerBadges entry={entry} />

        <div className={styles["hb-message-bubble-wrap"]}>
          <div className={mine ? styles["hb-bubble-user"] : styles["hb-bubble-bot"]}>
            {quotedEntry != null && <ReplyQuote quotedEntry={quotedEntry} missingLabel="" mine={mine} />}
            <MarkdownView text={text} richText={richText} members={members} />
            <Attachments paths={attachmentPaths} />
          </div>
          <HoverActions
            chatId={chat.id}
            entryId={entry.id}
            authorName={author?.name ?? ""}
            previewText={text}
            isMine={mine}
            hovered={hovered}
          />
          <time className={styles["hb-message-timestamp"]} dateTime={new Date(entry.timestampMs).toISOString()}>
            {formatClockTime(entry.timestampMs, locale)}
          </time>
        </div>

        <Reactions chatId={chat.id} entryId={entry.id} reactions={reactions} align={mine ? "end" : "start"} />
      </div>
    </div>
  );
}
