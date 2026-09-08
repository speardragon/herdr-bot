import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { DesktopBridge, DesktopUpdateState, DesktopUpdateStatus } from "../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L537
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export interface UpdateRequiredLabels {
  title: string;
  descriptionPrefix: string;
  descriptionSuffix: string;
  downloading: string;
  preparing: string;
  error: string;
  retry: string;
  update: string;
  restart: string;
  restarting: string;
}

export interface UpdateRequiredProps {
  bridge: Pick<DesktopBridge, "update">;
  labels: UpdateRequiredLabels;
  initialStatus?: DesktopUpdateStatus | null;
}

function isProgressState(state: DesktopUpdateState): boolean {
  return state.type === "checking" || state.type === "available" || state.type === "downloading" || state.type === "staging";
}

function progressLabel(state: DesktopUpdateState, labels: UpdateRequiredLabels): string {
  if (state.type === "downloading") return `${labels.downloading}${state.progress == null ? "" : ` ${Math.round(state.progress * 100)}%`}`;
  return labels.preparing;
}

const UPDATE_REQUIRED_FRAME_STYLE: CSSProperties = {
  alignItems: "center",
  backgroundColor: "var(--cursor-bg-editor)",
  boxSizing: "border-box",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  padding: "var(--cursor-spacing-12)",
  position: "fixed",
  zIndex: 9999
};
const UPDATE_REQUIRED_CARD_STYLE: CSSProperties = {
  alignItems: "center",
  backgroundColor: "var(--cursor-bg-card)",
  borderColor: "var(--cursor-stroke-secondary)",
  borderRadius: "var(--cursor-radius-xl)",
  borderStyle: "solid",
  borderWidth: 1,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: "var(--cursor-spacing-4)",
  maxWidth: 400,
  padding: "var(--cursor-spacing-8)",
  textAlign: "center",
  width: "min(400px, 100%)"
};
const UPDATE_LOADING_ICON_STYLE: CSSProperties = { fontFamily: "cursor-icons" };

export function UpdateRequired({ bridge, labels, initialStatus = null }: UpdateRequiredProps) {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(initialStatus);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void bridge.update.getStatus().then((next) => active && setStatus(next)).catch(() => undefined);
    const stop = bridge.update.onStatusEvent((next) => setStatus(next));
    return () => { active = false; stop(); };
  }, [bridge]);

  if (status == null || !status.isBelowMinimumVersion) return null;
  const state = status.state;
  let action: ReactNode;
  if (state.type === "ready") {
    action = <button disabled={pending} onClick={() => {
      setPending(true);
      void bridge.update.quitAndInstall().catch(() => undefined).finally(() => setPending(false));
    }} type="button">{pending ? labels.restarting : labels.restart}</button>;
  } else if (isProgressState(state)) {
    action = <div aria-label={progressLabel(state, labels)} role="status"><span aria-hidden="true" data-icon-name="loading" style={UPDATE_LOADING_ICON_STYLE}>{String.fromCodePoint(0xedca)}</span><span>{progressLabel(state, labels)}</span></div>;
  } else {
    const failed = state.type === "idle" && state.lastCheck?.result === "error";
    action = <>
      {failed ? <p>{labels.error}</p> : null}
      <button disabled={pending} onClick={() => {
        setPending(true);
        void bridge.update.check().then(setStatus).catch(() => undefined).finally(() => setPending(false));
      }} type="button">{failed ? labels.retry : labels.update}</button>
    </>;
  }
  return (
    <div className="sand-update-required" style={UPDATE_REQUIRED_FRAME_STYLE}>
      <div role="alert" style={UPDATE_REQUIRED_CARD_STYLE}>
        <div>
          <p>{labels.title}</p>
          <p>{labels.descriptionPrefix}{status.currentVersion}{labels.descriptionSuffix}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
