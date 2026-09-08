import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import type { TimelineEventData, TimelineEventMetadata, TimelineEventProtocolKey, TimelineEventRegistry } from "./timeline-event-registry";
import { createTimelineEventRegistry, timelineEventActionVerb, timelineEventDescription, timelineEventProtocolKey } from "./timeline-event-registry";
import { TimelineEventCard } from "./timeline-event";
import { AutomationChangedTimelineEventCard } from "./timeline-event-automation";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5107516 (event lazy view map)
// @evidence src/app/dist/renderer/assets/view-BEocLLTG.js#route=/src/electron-renderer/features/channels/cards/event/channel-connected/view.tsx
// @evidence src/app/dist/renderer/assets/view-BMD9fbyy.js#route=/src/electron-renderer/features/channels/cards/event/channel-disconnected/view.tsx
// @evidence src/app/dist/renderer/assets/view-LYKe8-aA.js#route=/src/electron-renderer/features/chat/cards/event/name-changed/view.tsx
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#route=/src/electron-renderer/features/agents/cards/event/automation-changed/view.tsx#chunk=view-BXS10NUs.js

export interface TimelineEventViewProps {
  readonly id: string;
  readonly event: TimelineEventData;
  /** Persisted TranscriptTimelineEvent.timestampMs; the host must supply the model field. */
  readonly timestampMs: number;
  readonly description?: string;
  readonly actionVerb?: string | null;
  readonly onOpenAutomation?: (automationId: string) => void;
}

export interface TimelineEventViewModule {
  default: ComponentType<TimelineEventViewProps>;
}

export type TimelineEventViewLoader = () => Promise<TimelineEventViewModule>;
export type TimelineEventViewLoaders = Partial<Record<TimelineEventProtocolKey, TimelineEventViewLoader>>;

const TIMELINE_EVENT_VIEW_LOADERS: Record<TimelineEventProtocolKey, TimelineEventViewLoader> = {
  "event:channel-connected": async () => ({ default: TimelineEventCard }),
  "event:channel-disconnected": async () => ({ default: TimelineEventCard }),
  "event:name-changed": async () => ({ default: TimelineEventCard }),
  "event:automation-changed": async () => ({ default: AutomationChangedTimelineEventCard }),
};

export interface TimelineEventResolver extends TimelineEventRegistry {
  readonly loaders: Readonly<TimelineEventViewLoaders>;
  load(protocolKey: TimelineEventProtocolKey): Promise<TimelineEventViewModule | null>;
}

export function createTimelineEventResolver(loaders: TimelineEventViewLoaders = TIMELINE_EVENT_VIEW_LOADERS): TimelineEventResolver {
  const registry = createTimelineEventRegistry();
  return {
    loaders,
    metadata: registry.metadata,
    async load(protocolKey) {
      const loader = loaders[protocolKey];
      return loader == null ? null : loader();
    },
  };
}

const lazyLeaves = new Map<TimelineEventProtocolKey, LazyExoticComponent<ComponentType<TimelineEventViewProps>>>();
function leafFor(protocolKey: TimelineEventProtocolKey): LazyExoticComponent<ComponentType<TimelineEventViewProps>> {
  const existing = lazyLeaves.get(protocolKey);
  if (existing != null) return existing;
  const created = lazy(async () => (await createTimelineEventResolver().load(protocolKey)) ?? { default: () => null });
  lazyLeaves.set(protocolKey, created);
  return created;
}

export function TimelineEventRootEntry({ id, event, onOpenAutomation, timestampMs }: TimelineEventViewProps) {
  const protocolKey = timelineEventProtocolKey(event);
  if (protocolKey == null) return null;
  const metadata: TimelineEventMetadata = createTimelineEventRegistry().metadata(protocolKey);
  const Leaf = leafFor(protocolKey);
  const automation = protocolKey === "event:automation-changed";
  return (
    <Suspense fallback={<div aria-hidden="true" style={{ height: metadata.placeholderHeight, width: "100%" }} />}>
      <Leaf
        actionVerb={automation ? timelineEventActionVerb(event) : null}
        description={automation ? timelineEventDescription(event) : ""}
        event={event}
        id={id}
        onOpenAutomation={automation ? onOpenAutomation : undefined}
        timestampMs={timestampMs}
      />
    </Suspense>
  );
}
