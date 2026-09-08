// Exact rename commit rule recovered from yut.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L51916

export function committedAgentName(initialValue: string, draftValue: string): string | null {
  const trimmed = draftValue.trim();
  return trimmed.length > 0 && trimmed !== initialValue ? trimmed : null;
}
