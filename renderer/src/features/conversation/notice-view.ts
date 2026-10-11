/**
 * Classifies a `notice` transcript entry for rendering. The host writes a notice's `content`
 * field in fixed Korean regardless of UI locale for *every* structured notice it builds (see
 * core/src/model/bot-system-events.ts: `이름 변경됨: ${newName}` / `메시지 보냄: ${targetName}`) --
 * confirmed by reading that source directly. Since a `bot-renamed`/`bot-message-sent` notice also carries
 * its data as a structured `event` field, this app re-renders those two from the structured fields through
 * its own i18n catalog (both languages, with the target's current avatar) instead of showing the raw
 * Korean `content` -- that localizes both languages without
 * touching the *other*, field-less notices (onboarding lines, the
 * late-reply-completion line), which have no structured data to rebuild from and must stay verbatim.
 *
 * Pure, DOM-free -- unit tested directly with `node --test`.
 */
import { getNoticeEvent, getRawText } from "./entry-shapes.ts";
import type { TranscriptEntry } from "../../data/types.ts";

export type NoticeView =
  | { readonly kind: "renamed"; readonly oldName: string; readonly newName: string }
  | { readonly kind: "delegated"; readonly targetChatId: string; readonly targetName: string; readonly targetKind: "bot" | "room" }
  | { readonly kind: "plain"; readonly text: string };

export function deriveNoticeView(entry: TranscriptEntry): NoticeView {
  const event = getNoticeEvent(entry);
  if (event?.type === "bot-renamed") return { kind: "renamed", oldName: event.oldName, newName: event.newName };
  if (event?.type === "bot-message-sent") return { kind: "delegated", targetChatId: event.targetChatId, targetName: event.targetName, targetKind: event.targetKind };
  return { kind: "plain", text: getRawText(entry) ?? "" };
}
