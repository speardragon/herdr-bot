import type { NoticeTargetAvatar, ResolveNoticeTargetAvatar, TranscriptNotice } from "../../workspace/model";
import { AgentAvatar } from "../../workspace/agent-avatar";
import { TranscriptCardTimestamp } from "../timeline-event";

// @evidence src/app/dist/renderer/assets/view-1r0bwdK4.js#byteOffset=172 (notice card utility frame)
// @evidence src/app/dist/renderer/assets/view-1r0bwdK4.js#byteOffset=253 (notice card selector)
const NOTICE_CLASS = "sand-notice sand-amitd3 sand-1yrsyyn sand-nuq7ks sand-10b6aqq sand-f18ygs sand-2b8uid";

/** herdr-bot (Task 9): a target the resolver no longer knows about (removed bot/room) still renders --
 * `targetKind` from the event decides the avatar shape, just without a live color/shape/memberIds. */
function fallbackTargetAvatar(targetKind: "bot" | "room"): NoticeTargetAvatar {
  return { kind: targetKind === "room" ? "group" : "agent", dataUrl: null, color: null, shape: null, memberIds: [] };
}

/** herdr-bot (Task 9): centered "이름 변경됨: <새 이름>" -- a bot's own rename, recorded in its DM. */
function BotRenamedNotice({ entry, newName }: { entry: TranscriptNotice; newName: string }) {
  const label = `이름 변경됨: ${newName}`;
  return <div className="sand-transcript-row" data-entry-id={entry.id} role="note">
    <div aria-label={label} className="herdr-bot-system-notice herdr-bot-system-notice--rename"><span>{label}</span></div>
    <TranscriptCardTimestamp timestampMs={entry.timestampMs} />
  </div>;
}

/** herdr-bot (Task 9): "메시지 보냄" + the target's CURRENT avatar (never a send-time snapshot) + the
 * `targetName` as it was recorded at send time. */
function BotMessageSentNotice({ entry, targetChatId, targetName, targetKind, resolveTargetAvatar }: {
  entry: TranscriptNotice;
  targetChatId: string;
  targetName: string;
  targetKind: "bot" | "room";
  resolveTargetAvatar?: ResolveNoticeTargetAvatar;
}) {
  const avatar = resolveTargetAvatar?.(targetChatId) ?? fallbackTargetAvatar(targetKind);
  const label = `메시지 보냄: ${targetName}`;
  return <div className="sand-transcript-row" data-entry-id={entry.id} role="note">
    <div aria-label={label} className="herdr-bot-system-notice herdr-bot-system-notice--message-sent">
      <span>메시지 보냄</span>
      <AgentAvatar agentId={targetChatId} color={avatar.color} dataUrl={avatar.dataUrl} isStatic kind={avatar.kind} memberIds={avatar.memberIds} shape={avatar.shape} size="xs" />
      <span>{targetName}</span>
    </div>
    <TranscriptCardTimestamp timestampMs={entry.timestampMs} />
  </div>;
}

/**
 * Shipped notice:notice transcript card, mounted at the existing notice union branch. Extended (Task
 * 9, plan bot-collaboration-and-launch-settings) to special-case the two structured `event` kinds a
 * notice may carry; an unrecognized event or an older plain notice (`event` unset -- already validated
 * away at the projection boundary in production/model.ts) falls through to the original plain render.
 */
export function TranscriptNoticeCard({ entry, resolveTargetAvatar }: { entry: TranscriptNotice; resolveTargetAvatar?: ResolveNoticeTargetAvatar }) {
  if (entry.event?.type === "bot-renamed") return <BotRenamedNotice entry={entry} newName={entry.event.newName} />;
  if (entry.event?.type === "bot-message-sent") {
    return <BotMessageSentNotice entry={entry} resolveTargetAvatar={resolveTargetAvatar} targetChatId={entry.event.targetChatId} targetKind={entry.event.targetKind} targetName={entry.event.targetName} />;
  }
  return <div className="sand-transcript-row" data-entry-id={entry.id} role="note">
    <div className={NOTICE_CLASS}><span>{entry.text}</span></div>
    <TranscriptCardTimestamp timestampMs={entry.timestampMs} />
  </div>;
}
