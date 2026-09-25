import type { NewEntry } from "../store/transcript-store.ts";

/**
 * A structured system notice recording bot-driven collaboration activity (Task 9, plan
 * bot-collaboration-and-launch-settings): a rename, or a cross-chat `message` delivery. Carried on a
 * plain `notice` transcript entry's optional `event` field so old/plain notices (onboarding, turn
 * outcomes, etc.) are unaffected and still render as a bare string.
 */
export type BotSystemEvent =
  | { readonly type: "bot-renamed"; readonly oldName: string; readonly newName: string }
  | { readonly type: "bot-message-sent"; readonly targetChatId: string; readonly targetName: string; readonly targetKind: "bot" | "room" };

export function botSystemNoticeEntry(event: BotSystemEvent, timestampMs: number): NewEntry {
  const content = event.type === "bot-renamed"
    ? `이름 변경됨: ${event.newName}`
    : `메시지 보냄: ${event.targetName}`;
  return { kind: "notice", content, event, timestampMs };
}
