import { findLiteralMentions, isEveryoneMention } from "./literal-mentions.ts";
import { findSoftMention } from "./soft-mentions.ts";
import type { RoomMember, RoomMessage } from "./types.ts";

/** The stretch of the transcript from the most recent human-authored message onward (inclusive); if
 * there has never been a human message, the entire transcript. */
export function stretchSinceLastHuman(history: readonly RoomMessage[]): RoomMessage[] {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.speaker.kind === "user") return [...history.slice(index)];
  }
  return [...history];
}

/** The union of members mentioned (literally or, per the soft-mention rule, softly) across `stretch`,
 * or every member's id when any message there is an "everyone" message or no member is mentioned
 * anywhere in it at all. */
export function responderIdsFromStretch(stretch: readonly RoomMessage[], members: readonly RoomMember[]): string[] {
  const joinOrder = members.map((member) => member.id);
  let everyone = false;
  const mentioned = new Set<string>();
  for (const message of stretch) {
    const isEveryone = isEveryoneMention(message.content);
    if (isEveryone) everyone = true;
    const { mentionedIds } = findLiteralMentions(message.content, members);
    for (const id of mentionedIds) mentioned.add(id);
    // A soft mention is only even attempted when this message has zero literal mentions and zero
    // everyone-flag of its own, and only ever for a human-authored message.
    if (message.speaker.kind === "user" && mentionedIds.size === 0 && !isEveryone) {
      const soft = findSoftMention(message.content, members);
      if (soft != null) mentioned.add(soft);
    }
  }
  if (everyone || mentioned.size === 0) return joinOrder;
  return joinOrder.filter((id) => mentioned.has(id));
}

/** Convenience wrapper over {@link stretchSinceLastHuman} + {@link responderIdsFromStretch}. */
export function resolveResponders(history: readonly RoomMessage[], members: readonly RoomMember[]): string[] {
  return responderIdsFromStretch(stretchSinceLastHuman(history), members);
}

/**
 * Whether `memberId` is mentioned (literally, or via the "everyone" flag) anywhere in `history` from
 * `fromIndex` onward -- used for re-eligibility's "newly mentioned since it was marked answered"
 * check. Deliberately literal/everyone only, never soft.
 */
export function wasMentionedSince(history: readonly RoomMessage[], fromIndex: number, memberId: string, members: readonly RoomMember[]): boolean {
  for (let index = fromIndex; index < history.length; index += 1) {
    const message = history[index];
    if (message == null) continue;
    if (isEveryoneMention(message.content)) return true;
    const { mentionedIds } = findLiteralMentions(message.content, members);
    if (mentionedIds.has(memberId)) return true;
  }
  return false;
}
