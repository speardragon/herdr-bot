import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { DesktopBridge, DesktopUpdateStatus } from "../../../contracts/desktop-bridge";
import { SandButton } from "../../../ui/sand-kit-primitives";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L520
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export interface UpdatePillLabels {
  available: string;
  downloading: string;
  update: string;
  restarting: string;
}

export interface UpdatePillProps {
  bridge: Pick<DesktopBridge, "update">;
  labels: UpdatePillLabels;
  initialStatus?: DesktopUpdateStatus | null;
}

function progressLabel(status: DesktopUpdateStatus, labels: UpdatePillLabels): string {
  const progress = status.state.type === "downloading" ? status.state.progress : undefined;
  return `${labels.downloading}${progress == null ? "" : ` ${Math.round(progress * 100)}%`}`;
}

const UPDATE_PROGRESS_STYLE: CSSProperties = {
  alignItems: "center",
  color: "var(--cursor-text-tertiary)",
  display: "inline-flex",
  flexShrink: 0,
  height: 24,
  justifyContent: "center",
  width: 24
};

export function UpdatePill({ bridge, labels, initialStatus = null }: UpdatePillProps) {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(initialStatus);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void bridge.update.getStatus().then((next) => active && setStatus(next)).catch(() => undefined);
    const stop = bridge.update.onStatusEvent((next) => setStatus(next));
    return () => { active = false; stop(); };
  }, [bridge]);

  if (status == null || status.isBelowMinimumVersion) return null;
  if (status.state.type === "downloading" || status.state.type === "staging") {
    const label = progressLabel(status, labels);
    return <span aria-label={label} className="sand-update-pill" role="status" style={UPDATE_PROGRESS_STYLE}><span aria-hidden="true" data-icon-name="loading" style={{ fontFamily: "cursor-icons" }}>{String.fromCodePoint(0xedca)}</span></span>;
  }
  if (status.state.type !== "ready") return null;
  return <SandButton
    aria-label={labels.available}
    className="sand-update-pill"
    disabled={pending}
    onClick={() => {
      setPending(true);
      void bridge.update.quitAndInstall().catch(() => undefined).finally(() => setPending(false));
    }}
    size="sm"
    type="button"
    variant="secondary"
  >{pending ? labels.restarting : labels.update}</SandButton>;
}
