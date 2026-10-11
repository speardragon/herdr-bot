/**
 * @-mention recognition over plain message text. There is no host RPC or stored rich structure for
 * mentions in this demo data -- plain `@Name` text is all there is --
 * so a mention chip is rendered by matching `@Name`/`@everyone` substrings
 * against the chat's *current* member list at render time (which is also how "the mentioned bot's
 * CURRENT avatar" requirement is satisfied: resolve the id from this parse, then look the bot up in
 * `useChats()` live, not from anything frozen into the message).
 *
 * Pure, DOM-free -- unit tested directly with `node --test`.
 */

export interface MentionCandidate {
  readonly id: string;
  readonly name: string;
}

export type MentionToken = { readonly type: "text"; readonly value: string } | { readonly type: "mention"; readonly id: string | null; readonly name: string };

const EVERYONE_RE = /^everyone\b/i;

/** Splits `text` into alternating text/mention tokens. Longest-name-first matching so "Forge Prime" isn't
 * shadowed by a bare "Forge" candidate; `@everyone` (case-insensitive, literal) always wins
 * over any same-named candidate and resolves to `id: null`. Only matches at a word boundary before the
 * `@` and after the candidate name, so "email@forge.dev" or "@Forgery" don't false-positive. */
export function parseMentions(text: string, members: readonly MentionCandidate[]): MentionToken[] {
  if (text.length === 0) return [];
  const byLength = [...members].sort((a, b) => b.name.length - a.name.length);

  const tokens: MentionToken[] = [];
  let buffer = "";
  let i = 0;

  function flushBuffer() {
    if (buffer.length > 0) {
      tokens.push({ type: "text", value: buffer });
      buffer = "";
    }
  }

  while (i < text.length) {
    const ch = text[i];
    const precededByWordChar = i > 0 && /[\w@]/.test(text[i - 1]!);
    if (ch !== "@" || precededByWordChar) {
      buffer += ch;
      i += 1;
      continue;
    }

    const rest = text.slice(i + 1);
    const everyoneMatch = EVERYONE_RE.exec(rest);
    if (everyoneMatch != null && !/[\w]/.test(rest[everyoneMatch[0].length] ?? "")) {
      flushBuffer();
      tokens.push({ type: "mention", id: null, name: "everyone" });
      i += 1 + everyoneMatch[0].length;
      continue;
    }

    const candidate = byLength.find((member) => rest.startsWith(member.name) && !/[\w]/.test(rest[member.name.length] ?? ""));
    if (candidate != null) {
      flushBuffer();
      tokens.push({ type: "mention", id: candidate.id, name: candidate.name });
      i += 1 + candidate.name.length;
      continue;
    }

    buffer += ch;
    i += 1;
  }
  flushBuffer();
  return tokens;
}
