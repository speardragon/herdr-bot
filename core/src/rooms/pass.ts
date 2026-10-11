/**
 * Recognizes text that reads as "just a pass": trimmed-empty, or case-insensitively the word "pass"
 * optionally wrapped in parentheses and optionally followed by a trailing period.
 *
 * Decision #3 (kept, unwired): nothing in this module or its callers consults this to change
 * behavior (display, re-eligibility, caps, or the loop guard). The genuine "I have nothing to add"
 * path is a dedicated zero-content action that produces no transcript entry at all; a member saying
 * the literal word "pass" through its normal speaking channel is just an ordinary spoken message.
 * See cycle.ts's design note.
 */
export function isPassLike(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  return /^(\(pass\)|pass)\.?$/i.test(trimmed);
}
