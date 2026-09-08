import { type ReactNode } from "react";
import type { TranscriptThreadSummary } from "./thread-summary-controller";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5080561 (View thread copy/label)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5080586 (sand-thread-affordance)

export interface ThreadAffordanceProps {
  readonly summary: TranscriptThreadSummary;
  readonly onOpen: (rootId: string) => void;
  readonly role?: string;
  readonly children?: ReactNode;
}

export function threadReplyLabel(count: number): string {
  return count === 1 ? "1 reply" : `${count} replies`;
}

export function ThreadAffordance({ summary, onOpen, role, children }: ThreadAffordanceProps) {
  if (summary.rootId.length === 0 || !Number.isInteger(summary.count) || summary.count <= 0) return null;
  const countLabel = threadReplyLabel(summary.count);
  return (
    <button
      aria-label={`View thread, ${countLabel}`}
      className="sand-thread-affordance"
      data-role={role}
      onClick={() => onOpen(summary.rootId)}
      type="button"
    >
      {children ?? <span>View thread</span>}
      <span aria-hidden="true" className="sand-thread-affordance__count">{countLabel}</span>
    </button>
  );
}
