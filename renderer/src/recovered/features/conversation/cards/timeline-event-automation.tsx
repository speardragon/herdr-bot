import type { AutomationChangedTimelineEvent, TimelineEventData } from "./timeline-event-registry";
import { TranscriptCardTimestamp } from "./timeline-event";
import { SandButton } from "../../../ui/sand-kit-primitives";

// @evidence src/app/dist/renderer/assets/view-BXS10NUs.js#sha256=8560a41d440edd9e51c60360967caf2a9738b02ae824492e0efb719e51320c97
// @evidence src/app/dist/renderer/assets/view-BXS10NUs.js#props=entry.event.automationName,actionVerb,onOpenAutomation#copy=Open routine
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5102791 (calendar icon, 32px card metadata)

export const AUTOMATION_CHANGED_CARD_PLACEHOLDER_HEIGHT = 32 as const;

export interface AutomationChangedTimelineEventCardProps {
  readonly id: string;
  readonly event: TimelineEventData;
  readonly timestampMs?: number;
  readonly description?: string;
  readonly actionVerb?: string | null;
  readonly onOpenAutomation?: (automationId: string) => void;
}

export function automationOpenId(event: unknown): string | null {
  if (typeof event !== "object" || event === null || Array.isArray(event)) return null;
  const automationId = (event as { automationId?: unknown }).automationId;
  return typeof automationId === "string" && automationId.length > 0 ? automationId : null;
}

export function AutomationChangedTimelineEventCard({
  id,
  event,
  timestampMs,
  description,
  actionVerb = null,
  onOpenAutomation,
}: AutomationChangedTimelineEventCardProps) {
  if (event.type !== "automation-changed") return null;
  const automationEvent = event as AutomationChangedTimelineEvent;
  if (automationOpenId(automationEvent) == null || automationEvent.action.length === 0 || automationEvent.automationName.length === 0) return null;
  const openLabel = `Open routine ${automationEvent.automationName}`;
  const resolvedDescription = description ?? `Changed automation "${automationEvent.automationName}"`;
  const copy = actionVerb == null ? resolvedDescription : `${actionVerb} routine`;
  const automationId = automationOpenId(automationEvent);

  return (
    <div className="sand-transcript-row" data-entry-id={id} role="note">
        <span title={actionVerb == null ? resolvedDescription : undefined}>{copy}</span>
      <SandButton
        aria-label={openLabel}
        disabled={automationId == null || onOpenAutomation == null}
        onClick={(mouseEvent) => {
          mouseEvent.stopPropagation();
          if (automationId != null) onOpenAutomation?.(automationId);
        }}
        leadingIcon="clock"
        size="sm"
        title={automationEvent.automationName}
        type="button"
      >
        {automationEvent.automationName}
      </SandButton>
      <TranscriptCardTimestamp timestampMs={timestampMs} />
    </div>
  );
}

export default AutomationChangedTimelineEventCard;
