import { useId, useRef, useSyncExternalStore } from "react";
import type { AppAlertController } from "./controller";
import { OverlayDialog } from "../../../ui/overlay-primitives";
import { SandButton } from "../../../ui/sand-kit-primitives";

// The shipped alert host is JVn over the shared modal Root. This leaf remains
// unmounted until the root app-context owner is ready.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5743352
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=7222969

export interface AppAlertHostProps {
  readonly controller: AppAlertController;
}

export function AppAlertHost({ controller }: AppAlertHostProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = state != null;
  const request = state?.request ?? null;

  if (request == null || state == null) return null;
  const width = request.width === "wide" ? 500 : 380;
  const hasBody = request.body != null || request.warning != null || state.failure != null;
  const confirmLabel = state.isPerforming ? request.pendingLabel ?? request.confirmLabel : request.confirmLabel;

  return (
      <OverlayDialog
        closeOnBackdrop={state.isPerforming !== true}
        closeOnEscape={state.isPerforming !== true}
        describedBy={request.description == null ? undefined : descriptionId}
        initialFocusRef={confirmRef}
        labelledBy={titleId}
        onClose={() => controller.cancel()}
        open
        className="sand-dialog sand-alert-dialog"
        panelStyle={{ position: "fixed", inset: "50% auto auto 50%", width: `min(${width}px, calc(100% - 32px))`, padding: 20, color: "var(--cursor-text-primary)", background: "var(--cursor-bg-elevated)", border: "1px solid var(--cursor-border-secondary)", borderRadius: 10, boxShadow: "var(--cursor-box-shadow-xl)", transform: "translate(-50%, -50%)", zIndex: 3200 }}
        dataPresentation="simple"
      >
        <header><h2 id={titleId}>{request.title}</h2>{request.description == null ? null : <p id={descriptionId}>{request.description}</p>}</header>
        {hasBody ? <div>{request.body == null ? null : <p>{request.body}</p>}{request.warning == null ? null : <p>{request.warning}</p>}{state.failure == null ? null : <p role="alert">{state.failure}</p>}</div> : null}
        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, margin: "18px -20px -20px", padding: "12px 16px", borderTop: "1px solid var(--cursor-border-secondary)" }}>
          {request.cancelLabel == null ? null : <SandButton disabled={state.isPerforming} onClick={() => controller.cancel()} size="sm" variant="secondary">{request.cancelLabel}</SandButton>}
          {request.secondary == null ? null : <SandButton className="sand-alert-dialog__secondary" data-destructive={request.secondary.destructive === true ? "true" : undefined} disabled={state.isPerforming} onClick={() => controller.confirmSecondary()} sentiment={request.secondary.destructive === true ? "danger" : "neutral"} size="sm" variant="secondary">{request.secondary.label}</SandButton>}
          <SandButton data-destructive={request.destructive === true ? "true" : undefined} disabled={state.isPerforming} onClick={() => controller.confirm()} ref={confirmRef} sentiment={request.destructive === true ? "danger" : "neutral"} size="sm">{confirmLabel}</SandButton>
        </footer>
      </OverlayDialog>
  );
}
