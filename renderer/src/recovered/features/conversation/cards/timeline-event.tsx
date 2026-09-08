import type { SandTimelineEvent } from "../../../../shared/sand-timeline-events";
import { describeTimelineEvent } from "../../../../shared/sand-timeline-events";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5249131 (shared transcript row timestamp)
// The event and notice leaves are mounted directly in the recovered transcript,
// so they carry the same row-owned timestamp that the shipped Lpt boundary adds.
const TRANSCRIPT_ROW_TIMESTAMP_CLASS = "sand-row-timestamp sand-10l6tqk sand-13vifvy sand-1ey2m1c sand-3m8u43 sand-78zum5 sand-6s0dn4 sand-13a6bvl sand-1lqa7cf sand-4b2ntj sand-fifm61 sand-1rhlpx6 sand-o5v014 sand-ss6m8b sand-uxw1ft sand-v4fu3i sand-5ss5yg sand-47corl sand-87ps6o sand-ba0exv";
const TRANSCRIPT_ROW_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function TranscriptCardTimestamp({ timestampMs }: { readonly timestampMs?: number }) {
  if (timestampMs == null || !Number.isFinite(timestampMs)) return null;
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return null;
  return <time aria-hidden="true" className={TRANSCRIPT_ROW_TIMESTAMP_CLASS} dateTime={date.toISOString()}>{TRANSCRIPT_ROW_TIME_FORMATTER.format(date)}</time>;
}

// The shipped event views use the timeline's default 32px placeholder frame.
// @evidence src/app/dist/renderer/assets/view-BEocLLTG.js#route=/src/electron-renderer/features/channels/cards/event/channel-connected/view.tsx#discriminant=event:channel-connected#placeholderHeight=32
// @evidence src/app/dist/renderer/assets/view-BMD9fbyy.js#route=/src/electron-renderer/features/channels/cards/event/channel-disconnected/view.tsx#discriminant=event:channel-disconnected#placeholderHeight=32
// @evidence src/app/dist/renderer/assets/view-LYKe8-aA.js#route=/src/electron-renderer/features/chat/cards/event/name-changed/view.tsx#discriminant=event:name-changed#placeholderHeight=32
export const TIMELINE_EVENT_CARD_PLACEHOLDER_HEIGHT = 32 as const;

// The shipped event view passes isTruncating: true to the shared text
// primitive. Keep the equivalent single-line/ellipsis behavior local to this
// unmounted leaf until the shared primitive is composed by the owner.
const TIMELINE_EVENT_CARD_TEXT_STYLE = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

type TimelineEventCardEvent = Extract<
  SandTimelineEvent,
  | { readonly type: "name-changed" }
  | { readonly type: "channel-connected" }
  | { readonly type: "channel-disconnected" }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimelineEventCardEvent(value: unknown): value is TimelineEventCardEvent {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "name-changed":
      return typeof value.to === "string";
    case "channel-connected":
    case "channel-disconnected":
      return typeof value.label === "string";
    default:
      return false;
  }
}

/**
 * Projects only the three shipped event-card variants. Unknown or malformed
 * events do not render a generic card until their own artifact contract is
 * recovered.
 */
export function describeTimelineEventCard(event: unknown): string | null {
  return isTimelineEventCardEvent(event) ? describeTimelineEvent(event) : null;
}

export interface TimelineEventCardProps {
  readonly id: string;
  readonly event: SandTimelineEvent;
  readonly timestampMs?: number;
}

/**
 * Unmounted shared leaf for the three 218-byte shipped timeline event views.
 * Mounting, ordering, and registry resolution remain owned by the workspace
 * model/registry boundary.
 */
export function TimelineEventCard({ id, event, timestampMs }: TimelineEventCardProps) {
  const description = describeTimelineEventCard(event);
  if (description == null) return null;

  return (
    <div className="sand-transcript-row" data-entry-id={id} role="note">
      <span title={description} style={TIMELINE_EVENT_CARD_TEXT_STYLE}>{description}</span>
      <TranscriptCardTimestamp timestampMs={timestampMs} />
    </div>
  );
}

export default TimelineEventCard;
