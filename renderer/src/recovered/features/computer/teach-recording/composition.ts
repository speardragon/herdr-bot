import { useSyncExternalStore } from "react";

import type { TeachRecordingArm, TeachRecordingStatus, TeachRecordingStore } from "./store";
import {
  projectTeachRecording,
  type TeachRecordingActions,
  type TeachRecordingPreviewProjection,
  type TeachRecordingStoreViewProps,
  type TeachRecordingTopBarProps
} from "./view";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=4828297-4834009 (bbn fullscreen composition)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=6063290-6070131 (Windows bbn fullscreen composition)

export interface TeachRecordingComputerCompositionInput {
  activeAgentId: string | null;
  featureEnabled: boolean;
  hasHandoff: boolean;
  hasLiveStage: boolean;
  isFullscreen: boolean;
  onMinimize(): void;
  onRequestComposerFocus(): void;
  openTrigger: "preview" | "handoff" | undefined;
  platform: NodeJS.Platform;
  recordingAgentName?: string;
  subjectLabel: string;
  store: Pick<TeachRecordingStore, "armed" | "nowMs" | "snapshots" | "arm" | "start" | "stop">;
}

export interface TeachRecordingComputerInjection {
  frame: { agentId: string | null; snapshot: TeachRecordingStatus };
  isTeachTaskAvailable: boolean;
  onCloseFullscreen(): void;
  preview: {
    actions: TeachRecordingActions;
    projection: TeachRecordingPreviewProjection | null;
  };
  storeView: TeachRecordingStoreViewProps;
  topBar: TeachRecordingTopBarProps;
}

interface TeachRecordingObservedState {
  armed: TeachRecordingArm | null;
  nowMs: number;
  snapshot: TeachRecordingStatus;
}

function readStore(store: TeachRecordingComputerCompositionInput["store"]): TeachRecordingObservedState {
  return { armed: store.armed.get(), nowMs: store.nowMs.get(), snapshot: store.snapshots.get() };
}

function projectWithObservedState(
  input: TeachRecordingComputerCompositionInput,
  observed: TeachRecordingObservedState
): TeachRecordingComputerInjection {
  const { armed, nowMs, snapshot } = observed;
  const actions: TeachRecordingActions = { arm: input.store.arm, start: input.store.start, stop: input.store.stop };
  const isTeachTaskAvailable = input.featureEnabled
    && input.activeAgentId != null
    && input.hasLiveStage
    && !input.hasHandoff;
  const onCloseFullscreen = () => {
    if (snapshot.state !== "recording"
      && armed?.agentId === input.activeAgentId
      && armed.entryPoint === "composer_menu") input.store.arm(null);
    input.onMinimize();
    input.onRequestComposerFocus();
  };
  const onStartTeach = isTeachTaskAvailable
    && input.activeAgentId != null
    && snapshot.state !== "recording"
    && input.openTrigger === "preview"
    ? () => { void input.store.start(input.activeAgentId!, "fullscreen_title_bar"); }
    : null;
  const projectedRecording = projectTeachRecording({
    agentId: input.activeAgentId,
    armed,
    isTeachTaskAvailable,
    nowMs,
    recordingAgentName: input.recordingAgentName,
    snapshot,
    subjectLabel: input.subjectLabel
  });
  return {
    frame: { agentId: input.activeAgentId, snapshot },
    isTeachTaskAvailable,
    onCloseFullscreen,
    preview: {
      actions,
      projection: projectedRecording.kind === "recording" ? projectedRecording : null
    },
    storeView: {
      agentId: input.activeAgentId,
      isTeachTaskAvailable,
      isOverlayTone: true,
      onStopAndSave: onCloseFullscreen,
      recordingAgentName: input.recordingAgentName,
      subjectLabel: input.subjectLabel,
      store: input.store
    },
    topBar: {
      isFullscreen: input.isFullscreen,
      onExitFullscreen: onCloseFullscreen,
      onStartTeach,
      platform: input.platform
    }
  };
}

export function projectTeachRecordingComputerComposition(input: TeachRecordingComputerCompositionInput): TeachRecordingComputerInjection {
  return projectWithObservedState(input, readStore(input.store));
}

export function useTeachRecordingComputerComposition(input: TeachRecordingComputerCompositionInput): TeachRecordingComputerInjection {
  const snapshot = useSyncExternalStore(input.store.snapshots.subscribe, input.store.snapshots.get, input.store.snapshots.get);
  const armed = useSyncExternalStore(input.store.armed.subscribe, input.store.armed.get, input.store.armed.get);
  const nowMs = useSyncExternalStore(input.store.nowMs.subscribe, input.store.nowMs.get, input.store.nowMs.get);
  return projectWithObservedState(input, { armed, nowMs, snapshot });
}
