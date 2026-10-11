import { softHandles } from "./handles.ts";
import type { RoomMember } from "./types.ts";

/** Korean particles that may glue directly onto a bare-name soft mention with no space, tried
 * longest-first so a longer particle is never partially matched and left with a dangling remainder. */
const PARTICLES = [
  "에게서", "한테서", "이라고", "이랑은", "으로는", "에게는", "한테는",
  "이랑", "하고", "한테", "에게", "으로", "부터", "까지", "에서", "보다", "이나",
  "랑", "도", "만", "의", "과", "와", "은", "는", "이", "가", "을", "를", "로", "나",
].sort((a, b) => b.length - a.length);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PARTICLE_ALTERNATION = PARTICLES.map(escapeRegExp).join("|");

/** Unicode letter/digit/underscore -- excluded from being a valid boundary on either side of a soft
 * match. A hyphen is deliberately NOT in this set (the reverse of the literal-mention boundary): a
 * hyphen adjacent to the match still counts as a valid boundary here. */
function matchesSoftHandle(lowerText: string, handle: string): boolean {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(handle)}(?:${PARTICLE_ALTERNATION})?(?![\\p{L}\\p{N}_])`, "u");
  return pattern.test(lowerText);
}

/**
 * Resolves a message to exactly one member by bare name (optionally with a glued-on Korean
 * particle), or `null` when zero or more than one member's handles match. Callers are responsible
 * for only invoking this for a human message with zero literal mentions and zero everyone-flag of
 * its own -- this function itself does not check that.
 */
export function findSoftMention(text: string, members: readonly RoomMember[]): string | null {
  const lower = text.toLowerCase();
  const matched = new Set<string>();
  for (const member of members) {
    if (softHandles(member).some((handle) => matchesSoftHandle(lower, handle))) matched.add(member.id);
  }
  return matched.size === 1 ? [...matched][0]! : null;
}
