// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2145870 (terminalBackground theme token)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2145913 (terminalForeground theme token)
import type { CSSProperties } from "react";
import type { TerminalOutputSnapshot } from "./model";

const OUTPUT_STYLE: CSSProperties = {
  backgroundColor: "var(--cursor-bg-chrome)",
  color: "var(--cursor-text-primary)",
  fontFamily: "var(--cursor-font-family-mono)",
  margin: 0,
  maxHeight: "min(50vh, 480px)",
  overflow: "auto",
  padding: "12px",
  userSelect: "text",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word"
};

export interface TerminalOutputPanelProps {
  ariaLabel: string;
  snapshot: TerminalOutputSnapshot;
}

/**
 * Read-only terminal output leaf. The shipped renderer exposes terminal
 * result/metadata contracts, but no terminal coordinator or renderer mount;
 * execution and mutation controls therefore remain deliberately absent.
 */
export function TerminalOutputPanel({ ariaLabel, snapshot }: TerminalOutputPanelProps) {
  return <section
    aria-label={ariaLabel}
    data-terminal-session={snapshot.sessionId}
    data-terminal-status={snapshot.status}
    role="region"
  >
    <header>
      <code>{snapshot.command}</code>
      {snapshot.cwd == null ? null : <code data-terminal-cwd>{snapshot.cwd}</code>}
      <span aria-label={snapshot.status} data-terminal-exit-code={snapshot.exitCode == null ? undefined : snapshot.exitCode}>{snapshot.status}</span>
    </header>
    <pre aria-live={snapshot.status === "running" ? "polite" : "off"} aria-relevant="additions text" role="log" style={OUTPUT_STYLE} tabIndex={0}>{snapshot.output}</pre>
  </section>;
}
