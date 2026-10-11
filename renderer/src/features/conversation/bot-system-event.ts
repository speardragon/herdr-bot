/**
 * The structured payload a `notice` transcript entry optionally carries on `entry.event` (see
 * core/src/model/bot-system-events.ts -- not importable at runtime from a renderer, so the shape is
 * mirrored here; `entry-shapes.ts#getNoticeEvent` validates an entry against it). A notice *without* this
 * field (onboarding/turn-outcome notices, the late-reply-completion line) has no structured data to
 * re-render from and must be shown verbatim (its `content`) -- see `notice-view.ts`.
 */
export type BotSystemEvent =
  | { readonly type: "bot-renamed"; readonly oldName: string; readonly newName: string }
  | { readonly type: "bot-message-sent"; readonly targetChatId: string; readonly targetName: string; readonly targetKind: "bot" | "room" };
