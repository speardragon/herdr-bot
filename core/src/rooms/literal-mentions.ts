import { literalHandles } from "./handles.ts";
import type { RoomMember } from "./types.ts";

/** ASCII letters/digits/underscore/hyphen -- "word-forming" for the literal `@handle` boundary check.
 * Any non-ASCII character (Hangul included) is therefore NOT word-forming here and reads as a clean
 * boundary; see Decision #1 in cycle.ts. */
const ASCII_WORD_CHAR = "A-Za-z0-9_\\-";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface LiteralMentionResult {
  /** Every candidate member literally `@mentioned` somewhere in the message. */
  readonly mentionedIds: Set<string>;
  /** For each mentioned member, the earliest match-start index within this message (the position of
   * its `@`), used only for speaker-ordering's "mention order" tie-break. */
  readonly firstIndexByMember: Map<string, number>;
}

/** Literal `@handle` mentions of any of `members` in one message. */
export function findLiteralMentions(text: string, members: readonly RoomMember[]): LiteralMentionResult {
  const lower = text.toLowerCase();
  const mentionedIds = new Set<string>();
  const firstIndexByMember = new Map<string, number>();
  for (const member of members) {
    let earliest: number | null = null;
    for (const handle of literalHandles(member)) {
      const pattern = new RegExp(`(?<![${ASCII_WORD_CHAR}])@${escapeRegExp(handle)}(?![${ASCII_WORD_CHAR}])`, "g");
      for (const match of lower.matchAll(pattern)) {
        if (earliest == null || match.index < earliest) earliest = match.index;
      }
    }
    if (earliest != null) {
      mentionedIds.add(member.id);
      firstIndexByMember.set(member.id, earliest);
    }
  }
  return { mentionedIds, firstIndexByMember };
}

/** `@everyone` / `@all` as a whole word: preceded by start-of-string or a non-alphanumeric character,
 * followed by a word boundary -- this is deliberately its own, slightly narrower boundary rule, not
 * reused from the literal-mention check above: only letters/digits are excluded before the match, and
 * `\b` (letters/digits/underscore) after. */
const EVERYONE_PATTERN = /(?:^|[^a-z0-9])@(?:everyone|all)\b/;

export function isEveryoneMention(text: string): boolean {
  return EVERYONE_PATTERN.test(text.toLowerCase());
}
