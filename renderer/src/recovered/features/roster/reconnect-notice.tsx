// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L511
import { SandButton } from "../../ui/sand-kit-primitives";

export interface RosterReconnectNoticeProps {
  isRetrying: boolean;
  onRetry(): void;
}

export function RosterReconnectNotice({ isRetrying, onRetry }: RosterReconnectNoticeProps) {
  return (
    <div className="sand-agents-reconnect-notice" role="status">
      <span className="sand-agents-reconnect-notice__label">Reconnecting to your computer…</span>
      <SandButton disabled={isRetrying} onClick={onRetry} size="sm" variant="secondary">
        {isRetrying ? "Retrying…" : "Retry"}
      </SandButton>
    </div>
  );
}

export default RosterReconnectNotice;
