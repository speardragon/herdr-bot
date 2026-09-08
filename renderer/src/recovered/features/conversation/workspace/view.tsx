/**
 * The shipped conversation route is composed by the renderer root. No standalone
 * preview dialog is present in the immutable artifacts.
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L522
 */
export interface ConversationWorkspacePreviewProps {
  bridge?: unknown;
  onClose(): void;
  onStatus?(status: string): void;
}

export function ConversationWorkspacePreview(_props: ConversationWorkspacePreviewProps) {
  return null;
}
