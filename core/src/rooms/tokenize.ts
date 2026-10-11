/** Lowercased, letter/digit-only word tokens, Unicode-aware (not ASCII-only) -- used by speaker
 * ordering's keyword/role-fit scoring. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
