/**
 * Splits a `MessageSearchHit.snippet` (the host's own ±60-char, markdown-stripped window, used
 * verbatim rather than re-derived client-side) into highlighted/plain
 * segments around the query match, for the result row's "match highlighted" display. Pure string
 * matching -- the host's snippet text is the single source of truth, this only decides which
 * characters of it to visually emphasize.
 */

export interface SnippetSegment {
  readonly text: string;
  readonly match: boolean;
}

/** Case-insensitive first-match highlight. A query that doesn't literally appear in the snippet (e.g.
 * the host's search matched on something the ±60-char window trimmed away) degrades gracefully to one
 * unhighlighted segment rather than throwing. */
export function highlightSnippet(snippet: string, query: string): readonly SnippetSegment[] {
  const needle = query.trim();
  if (needle.length === 0) return [{ text: snippet, match: false }];

  const matchIndex = snippet.toLowerCase().indexOf(needle.toLowerCase());
  if (matchIndex === -1) return [{ text: snippet, match: false }];

  const segments: SnippetSegment[] = [];
  if (matchIndex > 0) segments.push({ text: snippet.slice(0, matchIndex), match: false });
  segments.push({ text: snippet.slice(matchIndex, matchIndex + needle.length), match: true });
  const rest = snippet.slice(matchIndex + needle.length);
  if (rest.length > 0) segments.push({ text: rest, match: false });
  return segments;
}
