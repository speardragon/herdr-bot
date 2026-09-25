import type { BotSystemEvent } from "../recovered/features/conversation/workspace/model";

/**
 * Small, dependency-free validator for a `notice` transcript entry's optional `event` payload (Task 9,
 * plan bot-collaboration-and-launch-settings). Deliberately kept out of model.ts: model.ts pulls in the
 * full "recovered/features/conversation" import graph (several of those modules use extensionless
 * imports that only resolve under bundler/tsc resolution, not under Node's native module loader), so
 * importing model.ts directly from a `node --test` file fails (see transcript-seq.ts's own header for
 * the same reasoning). This function has no such dependencies and is safe to unit test directly.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Validates the event defensively -- it round-trips through JSON/IPC from the host, so an unrecognized
 * `type` or a field of the wrong shape (not just a missing one) must fall back to `null` rather than
 * render a half-formed card. The caller then shows the entry's plain stored `text` instead, exactly
 * like an older transcript's plain notice.
 */
export function projectBotSystemEvent(value: unknown): BotSystemEvent | null {
  if (!isRecord(value)) return null;
  if (value.type === "bot-renamed") {
    const oldName = stringValue(value.oldName);
    const newName = stringValue(value.newName);
    return oldName == null || newName == null ? null : { type: "bot-renamed", oldName, newName };
  }
  if (value.type === "bot-message-sent") {
    const targetChatId = stringValue(value.targetChatId);
    const targetName = stringValue(value.targetName);
    const targetKind = value.targetKind === "bot" || value.targetKind === "room" ? value.targetKind : null;
    return targetChatId == null || targetName == null || targetKind == null
      ? null
      : { type: "bot-message-sent", targetChatId, targetName, targetKind };
  }
  return null;
}
