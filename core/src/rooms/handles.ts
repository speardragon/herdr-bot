import { SOFT_MENTION_MIN_ID_LEN, SOFT_MENTION_MIN_NAME_LEN } from "./constants.ts";

/** Just the fields handle derivation needs -- a plain `{id, name}` is enough, so tests don't have to
 * build a full {@link RoomMember} (with `description`) just to exercise this. */
export interface HandleSource {
  readonly id?: string;
  readonly name: string;
}

function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * Handles for the LITERAL `@handle` mention check: the full name, the name with whitespace removed,
 * just its first word, and the id -- deduplicated. A blank name contributes nothing; a present id
 * always contributes its own handle regardless of length.
 */
export function literalHandles(member: HandleSource): string[] {
  const handles = new Set<string>();
  const name = member.name.trim();
  if (name.length > 0) {
    const lower = name.toLowerCase();
    handles.add(lower);
    handles.add(squash(lower));
    const firstWord = lower.split(/\s+/)[0];
    if (firstWord != null && firstWord.length > 0) handles.add(firstWord);
  }
  if (member.id != null && member.id.length > 0) handles.add(member.id.toLowerCase());
  return [...handles];
}

/**
 * Handles for the SOFT (no-`@`) mention check: the full name and its squashed form -- never the
 * bare first word of a multi-word name -- plus the id, each only when it clears its minimum length.
 */
export function softHandles(member: HandleSource): string[] {
  const handles = new Set<string>();
  const name = member.name.trim();
  if (name.length > 0) {
    const lower = name.toLowerCase();
    if (lower.length >= SOFT_MENTION_MIN_NAME_LEN) handles.add(lower);
    const squashed = squash(lower);
    if (squashed.length >= SOFT_MENTION_MIN_NAME_LEN) handles.add(squashed);
  }
  if (member.id != null) {
    const idLower = member.id.toLowerCase();
    if (idLower.length >= SOFT_MENTION_MIN_ID_LEN) handles.add(idLower);
  }
  return [...handles];
}
