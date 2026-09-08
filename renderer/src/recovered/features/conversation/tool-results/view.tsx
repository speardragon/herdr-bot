import type { CSSProperties } from "react";
import type { ToolResultCardSnapshot } from "./model";

const CARD_STYLE: CSSProperties = {
  background: "var(--cursor-bg-chrome)",
  border: "1px solid var(--cursor-border-secondary)",
  borderRadius: 8,
  color: "var(--cursor-text-primary)",
  marginBlock: 8,
  maxWidth: "min(760px, 100%)",
  overflow: "hidden"
};

const BODY_STYLE: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 12
};

const PRE_STYLE: CSSProperties = {
  background: "var(--cursor-bg-editor)",
  borderRadius: 6,
  margin: 0,
  maxHeight: "min(40vh, 360px)",
  overflow: "auto",
  padding: 10,
  userSelect: "text",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};

export interface ToolResultCardProps {
  expanded?: boolean;
  snapshot: ToolResultCardSnapshot;
}

/**
 * Isolated, read-only result card. The shipped renderer exposes the result
 * contracts, but no mounted tool-result card or bridge action seam in this
 * reconstruction; copy/open/reveal and execution controls stay absent.
 */
export function ToolResultCard({ expanded = false, snapshot }: ToolResultCardProps) {
  const heading = snapshot.path ?? snapshot.command ?? snapshot.kind;
  const detail = snapshot.summary || snapshot.diff || snapshot.output;
  return <details aria-label={snapshot.kind} data-tool-call-id={snapshot.toolCallId ?? undefined} data-tool-result-kind={snapshot.kind} data-tool-result-status={snapshot.status} open={expanded} style={CARD_STYLE}>
    <summary data-tool-result-summary={heading} style={{ cursor: "pointer", padding: "10px 12px" }}>
      <code>{heading}</code>
      <span data-tool-result-state={snapshot.status} style={{ marginInlineStart: 8 }}>{snapshot.status}</span>
    </summary>
    <div style={BODY_STYLE}>
      {snapshot.workingDirectory == null ? null : <code data-tool-working-directory>{snapshot.workingDirectory}</code>}
      {detail.length === 0 ? null : <pre aria-live={snapshot.isStreaming ? "polite" : "off"} aria-relevant="additions text" role="log" style={PRE_STYLE}>{detail}</pre>}
      {snapshot.diff.length === 0 ? null : <pre data-tool-result-diff aria-label={snapshot.path ?? snapshot.kind} style={PRE_STYLE}>{snapshot.diff}</pre>}
    </div>
  </details>;
}
