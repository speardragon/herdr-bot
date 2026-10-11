import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useChatMembers } from "../../data/hooks/useChat.ts";
import { useChats } from "../../data/hooks/useChats.ts";
import type { TranscriptHandle } from "../../data/hooks/useTranscript.ts";
import { Spinner } from "../../primitives/index.ts";
import type { ChatSummary, TranscriptEntry } from "../../data/types.ts";
import { DateSeparator } from "./DateSeparator.tsx";
import { EmptyChat } from "./EmptyChat.tsx";
import { getAuthor } from "./entry-shapes.ts";
import { buildTranscriptRows } from "./group-messages.ts";
import { clearJumpTarget, useJumpTarget } from "../../data/jump-target.ts";
import { MessageBubble } from "./MessageBubble.tsx";
import { Notice } from "./Notice.tsx";
import { PromptCard } from "./PromptCard.tsx";
import { isNearBottom, isNearTop, olderPageScrollAdjustment } from "./scroll-anchor.ts";
import { useMarkRead } from "./useMarkRead.ts";
import { WorkingIndicator } from "./WorkingIndicator.tsx";
import styles from "./Transcript.module.css";

export interface TranscriptProps {
  readonly chatId: string;
  readonly chat: ChatSummary;
  readonly transcript: TranscriptHandle;
}

const JUMP_HIGHLIGHT_MS = 2200;

/** The scrolling message history: opens pinned to the latest message (and stays pinned
 * through late layout growth), preserves scroll position when an older page loads, and highlights a
 * message selected from the command palette (see data/jump-target.ts). */
export function Transcript({ chatId, chat, transcript }: TranscriptProps) {
  const members = useChatMembers(chat);
  const chats = useChats();
  const jumpTarget = useJumpTarget(chatId);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const olderAnchorRef = useRef<number | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useMarkRead(chatId, chat, transcript.loaded, transcript.entries);

  const rows = useMemo(() => buildTranscriptRows(transcript.entries), [transcript.entries]);
  const entriesById = useMemo(() => {
    const map = new Map<string, TranscriptEntry>();
    for (const entry of transcript.entries) map.set(entry.id, entry);
    return map;
  }, [transcript.entries]);

  const mentionCandidates = useMemo(() => (chat.kind === "bot" ? [{ id: chat.id, name: chat.name }] : members.map((member) => ({ id: member.id, name: member.name }))), [chat, members]);

  const workingBots = useMemo(() => {
    if (chat.kind === "bot") return chat.isRunning || chat.currentActivity != null ? [chat] : [];
    return members.filter((member) => member.isRunning || member.currentActivity != null);
  }, [chat, members]);

  // Reset pin-to-bottom whenever the open chat changes.
  useEffect(() => {
    pinnedRef.current = true;
    olderAnchorRef.current = null;
  }, [chatId]);

  // Keep pinned to the latest message (initial load, and every new entry) unless this update was an
  // older-page prepend, in which case restore the reader's visual position instead (scroll-anchor.ts).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el == null) return;
    if (olderAnchorRef.current != null) {
      el.scrollTop += olderPageScrollAdjustment(olderAnchorRef.current, el.scrollHeight);
      olderAnchorRef.current = null;
      return;
    }
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [chatId, transcript.loaded, transcript.entries]);

  // Late layout growth (an image finishing loading, a code block reflowing) can grow the content after
  // the scroll above already ran -- a ResizeObserver catches that and re-pins if we were pinned.
  useEffect(() => {
    const el = containerRef.current;
    const content = contentRef.current;
    if (el == null || content == null) return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [chatId]);

  function handleScroll() {
    const el = containerRef.current;
    if (el == null) return;
    pinnedRef.current = isNearBottom(el.scrollTop, el.scrollHeight, el.clientHeight);
    if (isNearTop(el.scrollTop) && !transcript.loadingOlder && transcript.nextBeforeSeq !== undefined) {
      olderAnchorRef.current = el.scrollHeight;
      transcript.loadOlder();
    }
  }

  // Jump-to-message from the command palette (data/jump-target.ts): keep paging older history until the
  // target entry is loaded (or history runs out), then scroll it into view and flash a highlight.
  useEffect(() => {
    if (jumpTarget == null) return;
    if (!entriesById.has(jumpTarget.entryId)) {
      if (!transcript.loadingOlder && transcript.nextBeforeSeq !== undefined) transcript.loadOlder();
      return;
    }
    const node = containerRef.current?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(jumpTarget.entryId)}"]`);
    if (node == null) return;
    node.scrollIntoView({ block: "center" });
    setHighlightId(jumpTarget.entryId);
    const timeout = setTimeout(() => {
      setHighlightId(null);
      clearJumpTarget();
    }, JUMP_HIGHLIGHT_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `transcript.loadOlder` is stable per chat; re-running on every entries change is intentional (that's how paging-until-found progresses).
  }, [jumpTarget, entriesById]);

  if (!transcript.loaded) {
    return (
      <div className={styles["hb-transcript"]}>
        <Spinner />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles["hb-transcript"]} onScroll={handleScroll}>
      <div ref={contentRef} className={styles["hb-transcript-content"]}>
        {transcript.loadingOlder && (
          <div className={styles["hb-transcript-loading-older"]}>
            <Spinner />
          </div>
        )}
        {rows.length === 0 && <EmptyChat />}
        {rows.map((row) => {
          if (row.type === "date") return <DateSeparator key={row.key} timestampMs={row.timestampMs} />;
          if (row.type === "notice") return <Notice key={row.key} entry={row.entry} />;
          if (row.type === "prompt") {
            const authorId = getAuthor(row.entry)?.id;
            const botChat = chat.kind === "bot" ? chat : (chats.find((candidate) => candidate.id === authorId) ?? null);
            return <PromptCard key={row.key} entry={row.entry} botChat={botChat} />;
          }
          return (
            <div key={row.key} data-entry-id={row.entry.id} className={highlightId === row.entry.id ? styles["hb-transcript-row--highlight"] : undefined}>
              <MessageBubble chat={chat} entry={row.entry} grouped={row.grouped} showAuthorLabel={chat.kind === "room"} members={mentionCandidates} entriesById={entriesById} />
            </div>
          );
        })}
        <WorkingIndicator workingBots={workingBots} />
      </div>
    </div>
  );
}
