// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L511
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2554016 (all-hidden roster state)
import { SandButton } from "../../ui/sand-kit-primitives";

export type RosterStatusKind = "loading" | "empty" | "all-hidden" | "error";

export interface RosterStatusProps {
  kind: RosterStatusKind;
  isRetrying?: boolean;
  onRetry?(): void;
  onShowHiddenBots?(): void;
}

const ROSTER_STATUS_COPY = { retry: "Retry", retrying: "Retrying…" };

export function RosterStatus({ kind, isRetrying = false, onRetry, onShowHiddenBots }: RosterStatusProps) {
  if (kind === "loading") {
    return (
      <div className="sand-agents-state sand-agents-state--connecting" role="status">
        <div className="sand-agents-state__header">
          <span aria-hidden="true" />
          <span className="sand-agents-state__label">Connecting to your computer…</span>
        </div>
      </div>
    );
  }

  if (kind === "empty") return <div className="sand-agents-empty">No saved agents yet.</div>;

  if (kind === "all-hidden") {
    return <div className="sand-agents-empty">
      <span>All bots are hidden</span>
      <SandButton onClick={onShowHiddenBots} size="sm" variant="secondary">Show Hidden Bots</SandButton>
    </div>;
  }

  return (
    <div className="sand-agents-state sand-agents-state--unreachable" role="status">
      <div className="sand-agents-state__header">
        <span aria-hidden="true" />
        <span className="sand-agents-state__label">Can’t reach your computer</span>
      </div>
      <span className="sand-agents-state__body">Your agents are safe — they just can’t be loaded right now.</span>
      <div className="sand-agents-state__actions">
        <SandButton disabled={isRetrying} onClick={onRetry} size="sm" variant="secondary">{ROSTER_STATUS_COPY.retry}</SandButton>
        {isRetrying ? <span className="sand-agents-state__retrying">{ROSTER_STATUS_COPY.retrying}</span> : null}
      </div>
    </div>
  );
}

export default RosterStatus;
