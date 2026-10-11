import { findLiteralMentions } from "./literal-mentions.ts";
import { tokenize } from "./tokenize.ts";
import type { RoomMember, RoomMessage } from "./types.ts";

/**
 * Orders `candidateIds` for one round: every mentioned candidate first (in first-mention order over
 * `stretchMessages`), then every remaining candidate best-match-first by shared vocabulary with its
 * own title+description profile, then by room join order (the order `candidateIds` was handed in) as
 * the final tie-break throughout.
 */
export function orderSpeakers(candidateIds: readonly string[], stretchMessages: readonly RoomMessage[], membersById: ReadonlyMap<string, RoomMember>): string[] {
  const candidateMembers = candidateIds.flatMap((id) => { const member = membersById.get(id); return member == null ? [] : [member]; });

  // Step 1: mention order. Earliest (message index, char index) pair per candidate across the stretch.
  const positions = new Map<string, readonly [number, number]>();
  stretchMessages.forEach((message, messageIndex) => {
    const { firstIndexByMember } = findLiteralMentions(message.content, candidateMembers);
    for (const [id, charIndex] of firstIndexByMember) {
      if (!positions.has(id)) positions.set(id, [messageIndex, charIndex]);
    }
  });
  const mentionOrdered = candidateIds.filter((id) => positions.has(id));
  mentionOrdered.sort((a, b) => {
    const [aMessage, aChar] = positions.get(a)!;
    const [bMessage, bChar] = positions.get(b)!;
    return aMessage !== bMessage ? aMessage - bMessage : aChar - bChar;
    // Equal positions (and therefore equal comparator results) keep their relative order from
    // `candidateIds` -- Array#sort is stable, and `candidateIds` already reflects room join order.
  });

  // Step 2: keyword/role fit for whatever is left, by exact token equality with multiplicity.
  const remaining = candidateIds.filter((id) => !positions.has(id));
  const blobTokens = tokenize(stretchMessages.map((message) => message.content).join(" "));
  const scored = remaining.map((id) => {
    const member = membersById.get(id);
    const profileTokens = new Set(tokenize(`${member?.title ?? ""} ${member?.description ?? ""}`));
    const score = blobTokens.reduce((total, token) => total + (profileTokens.has(token) ? 1 : 0), 0);
    return { id, score };
  });
  scored.sort((a, b) => b.score - a.score); // stable: ties keep join order (step 3)

  return [...mentionOrdered, ...scored.map((entry) => entry.id)];
}
