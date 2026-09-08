import { useEffect, useState } from "react";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523

export interface SettingsComputerState {
  isUpdateBoxPending: boolean;
  isResetBoxPending: boolean;
  canUpdateBaseline: boolean;
  canUpdateBox: boolean;
  canResetBox: boolean;
  isRebuildBlocked: boolean;
  isBoxUpToDate: boolean;
  isDevBuild: boolean;
  workingAgentNames: readonly string[];
  isUpdateQueued: boolean;
}

export interface SettingsComputerActions {
  onUpdateBox(force: boolean): Promise<unknown> | void;
  onResetBox(): Promise<unknown> | void;
  queueUpdateWhenIdle(): Promise<unknown> | void;
  cancelQueuedUpdate(): Promise<unknown> | void;
}

export interface SettingsComputerMount {
  state: SettingsComputerState;
  actions: SettingsComputerActions;
}

export type SettingsComputerPhase = "unavailable" | "queued" | "up-to-date" | "ready" | "busy-override";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
export function settingsComputerPhase(state: Pick<SettingsComputerState, "canUpdateBaseline" | "canUpdateBox" | "isBoxUpToDate" | "isUpdateQueued">): SettingsComputerPhase {
  if (!state.canUpdateBaseline) return "unavailable";
  if (state.isUpdateQueued) return "queued";
  if (state.isBoxUpToDate) return "up-to-date";
  return state.canUpdateBox ? "ready" : "busy-override";
}

export interface SettingsComputerController {
  updateLabel: "Update" | "Click Again to Confirm" | "Cancel Update" | "Updating…";
  updateDisabled: boolean;
  updateConfirming: boolean;
  requestUpdate(): void;
  requestReset(): void;
  refreshAnyway(): void;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
export function useSettingsComputerController(state: SettingsComputerState, actions: SettingsComputerActions): SettingsComputerController {
  const [updateConfirming, setUpdateConfirming] = useState(false);
  const phase = settingsComputerPhase(state);

  useEffect(() => {
    if (state.isUpdateBoxPending || state.isResetBoxPending || phase !== "ready") setUpdateConfirming(false);
  }, [phase, state.isResetBoxPending, state.isUpdateBoxPending]);

  useEffect(() => {
    if (!updateConfirming) return;
    const timeout = window.setTimeout(() => setUpdateConfirming(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [updateConfirming]);

  const requestUpdate = () => {
    if (state.isRebuildBlocked || state.isUpdateBoxPending || state.isResetBoxPending) return;
    if (phase === "queued") {
      void Promise.resolve(actions.cancelQueuedUpdate()).catch(() => undefined);
      return;
    }
    if (phase === "busy-override") {
      void Promise.resolve(actions.onUpdateBox(true)).catch(() => undefined);
      return;
    }
    if (phase !== "ready" && phase !== "up-to-date") return;
    if (!updateConfirming) {
      setUpdateConfirming(true);
      return;
    }
    setUpdateConfirming(false);
    void Promise.resolve(actions.onUpdateBox(false)).catch(() => undefined);
  };

  const requestReset = () => {
    if (!state.canResetBox || state.isRebuildBlocked || state.isUpdateBoxPending || state.isResetBoxPending) return;
    void Promise.resolve(actions.onResetBox()).catch(() => undefined);
  };

  const refreshAnyway = () => {
    if (!state.isDevBuild || state.isRebuildBlocked || state.isUpdateBoxPending || state.isResetBoxPending) return;
    void Promise.resolve(actions.onUpdateBox(false)).catch(() => undefined);
  };

  return {
    updateLabel: state.isUpdateBoxPending ? "Updating…" : phase === "queued" ? "Cancel Update" : updateConfirming ? "Click Again to Confirm" : "Update",
    updateDisabled: state.isRebuildBlocked || state.isUpdateBoxPending || state.isResetBoxPending || phase === "unavailable",
    updateConfirming,
    requestUpdate,
    requestReset,
    refreshAnyway
  };
}
