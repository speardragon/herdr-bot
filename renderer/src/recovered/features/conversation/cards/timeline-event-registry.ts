import type { SandTimelineEvent } from "../../../../shared/sand-timeline-events";
import { AUTOMATION_ACTION_VERB, describeTimelineEvent } from "../../../../shared/sand-timeline-events";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5102900 (channel-connected card metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5103038 (channel-disconnected card metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5103190 (name-changed card metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5102791 (automation-changed card metadata: calendar icon, 32px placeholder)

export const TIMELINE_EVENT_TYPES = ["channel-connected", "channel-disconnected", "name-changed", "automation-changed"] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];
export type TimelineEventProtocolKey = `event:${TimelineEventType}`;

export interface AutomationChangedTimelineEvent {
  readonly type: "automation-changed";
  readonly automationId: string;
  readonly action: string;
  readonly automationName: string;
}

export type TimelineEventData =
  | Extract<SandTimelineEvent, { type: "name-changed" | "channel-connected" | "channel-disconnected" }>
  | AutomationChangedTimelineEvent;

export interface TimelineEventMetadata {
  readonly protocolKey: TimelineEventProtocolKey;
  readonly entryKind: "event";
  readonly eventType: TimelineEventType;
  readonly placeholderHeight: 32;
  readonly icon: "calendar" | null;
  readonly sourcePath: string;
  readonly chunkFile: string;
}

const metadata = (eventType: TimelineEventType, sourcePath: string, chunkFile: string, icon: "calendar" | null = null): TimelineEventMetadata => ({
  protocolKey: `event:${eventType}`,
  entryKind: "event",
  eventType,
  placeholderHeight: 32,
  icon,
  sourcePath,
  chunkFile,
});

export const TIMELINE_EVENT_REGISTRY: Readonly<Record<TimelineEventProtocolKey, TimelineEventMetadata>> = Object.freeze({
  "event:channel-connected": metadata("channel-connected", "/src/electron-renderer/features/channels/cards/event/channel-connected/view.tsx", "view-BEocLLTG.js"),
  "event:channel-disconnected": metadata("channel-disconnected", "/src/electron-renderer/features/channels/cards/event/channel-disconnected/view.tsx", "view-BMD9fbyy.js"),
  "event:name-changed": metadata("name-changed", "/src/electron-renderer/features/chat/cards/event/name-changed/view.tsx", "view-LYKe8-aA.js"),
  "event:automation-changed": metadata("automation-changed", "/src/electron-renderer/features/agents/cards/event/automation-changed/view.tsx", "view-BXS10NUs.js", "calendar"),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function projectTimelineEvent(value: unknown): TimelineEventData | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "name-changed" && typeof value.to === "string") return { type: value.type, to: value.to };
  if ((value.type === "channel-connected" || value.type === "channel-disconnected") && typeof value.label === "string") return { type: value.type, label: value.label };
  if (
    value.type === "automation-changed"
    && typeof value.automationId === "string"
    && value.automationId.length > 0
    && typeof value.action === "string"
    && value.action.length > 0
    && typeof value.automationName === "string"
    && value.automationName.length > 0
  ) {
    return {
      type: value.type,
      automationId: value.automationId,
      action: value.action,
      automationName: value.automationName,
    };
  }
  return null;
}

export function timelineEventProtocolKey(value: unknown): TimelineEventProtocolKey | null {
  const event = projectTimelineEvent(value);
  return event == null ? null : `event:${event.type}`;
}

export function timelineEventDescription(event: TimelineEventData): string {
  return describeTimelineEvent(event);
}

export function timelineEventActionVerb(event: TimelineEventData): string | null {
  if (event.type !== "automation-changed") return null;
  return AUTOMATION_ACTION_VERB[event.action] ?? null;
}

export interface TimelineEventRegistry {
  metadata(protocolKey: TimelineEventProtocolKey): TimelineEventMetadata;
}

export function createTimelineEventRegistry(): TimelineEventRegistry {
  return { metadata: (protocolKey) => TIMELINE_EVENT_REGISTRY[protocolKey] };
}
