import { useSyncExternalStore, type ReactNode } from "react";

import type {
  TeachRecordingArm,
  TeachRecordingStatus,
  TeachRecordingStore
} from "./store";
import { TeachButton, TeachIconButton, TeachRecordingMark } from "./primitives";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=4820129-4827355 (pbn/gbn/ybn exact teach presenter)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=6053376-6062169 (Windows pbn/gbn/ybn parity)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=4824213 (recording copy), 4824642 (save action), 4825100 (discard action), 4825974 (armed copy)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=6058185 (recording copy), 6058770 (save action), 6059354 (discard action), 6060431 (armed copy)

export interface TeachRecordingActions {
  arm(value: TeachRecordingArm | null): void;
  start(agentId: string, entryPoint?: string): void | Promise<void>;
  stop(agentId: string, save: boolean): void | Promise<void>;
}

export interface TeachRecordingControlsProps {
  agentId: string | null;
  armed: TeachRecordingArm | null;
  isTeachTaskAvailable: boolean;
  isOverlayTone?: boolean;
  nowMs: number;
  onStopAndSave?: () => void;
  recordingAgentName?: string;
  snapshot: TeachRecordingStatus;
  subjectLabel: string;
  actions: TeachRecordingActions;
}

export interface TeachRecordingStoreViewProps extends Omit<TeachRecordingControlsProps, "actions" | "armed" | "nowMs" | "snapshot"> {
  store: Pick<TeachRecordingStore, "armed" | "nowMs" | "snapshots" | "arm" | "start" | "stop">;
}

export type TeachRecordingProjection =
  | { kind: "hidden" }
  | { kind: "armed"; agentId: string; entryPoint: string }
  | { kind: "recording"; agentId: string; elapsedMs: number; isOwn: boolean; label: string };

export type TeachRecordingPreviewProjection = Extract<TeachRecordingProjection, { kind: "recording" }>;

export function formatTeachRecordingDuration(elapsedMs: number): string {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  return `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
}

export function projectTeachRecording(input: Pick<TeachRecordingControlsProps, "agentId" | "armed" | "isTeachTaskAvailable" | "nowMs" | "recordingAgentName" | "snapshot" | "subjectLabel">): TeachRecordingProjection {
  if (input.snapshot.state === "recording") {
    const recordingAgentId = input.snapshot.agentId;
    return {
      kind: "recording",
      agentId: recordingAgentId,
      elapsedMs: input.nowMs - input.snapshot.startedAtMs,
      isOwn: recordingAgentId === input.agentId,
      label: recordingAgentId === input.agentId ? `${input.subjectLabel} is watching and learning` : `Recording ${input.recordingAgentName ?? "another agent"}'s computer`
    };
  }
  if (!input.isTeachTaskAvailable || input.agentId == null || input.armed?.agentId !== input.agentId) return { kind: "hidden" };
  return { kind: "armed", agentId: input.agentId, entryPoint: input.armed.entryPoint };
}

const RECORD_PILL_STYLE = "sand-2lah0s sand-1kogg8i sand-1iorvi4 sand-jkvuk6 sand-25sj25 sand-1icxu4v sand-1jnr06f sand-4z9k3i sand-d4r4e8 sand-ntrugh sand-19ii5eu sand-fungia";
const STOP_RECORDING_STYLE = "sand-2lah0s sand-1kogg8i sand-1iorvi4 sand-jkvuk6 sand-25sj25 sand-1icxu4v sand-4z9k3i sand-d4r4e8 sand-6y9aml sand-tly4hf sand-6rl5ky";
const STOP_RECORDING_OVERLAY_STYLE = "sand-1hqw4a3 sand-46gfeq sand-dmyetp";
const DISCARD_RECORDING_STYLE = "sand-6rl5ky sand-n4ifyr";
const DISCARD_RECORDING_OVERLAY_STYLE = "sand-dmyetp sand-10r3i2m";
const DISMISS_STYLE = "sand-2lah0s sand-102cea3 sand-10r3i2m";

function RecordingControls({ projection, isOverlayTone, actions, onStopAndSave }: {
  projection: Extract<TeachRecordingProjection, { kind: "recording" }>;
  isOverlayTone: boolean;
  actions: TeachRecordingActions;
  onStopAndSave?: () => void;
}): ReactNode {
  const stopAndSave = () => {
    void actions.stop(projection.agentId, true);
    onStopAndSave?.();
  };
  return <div className="sand-9f619 sand-78zum5 sand-1cy8zhl sand-h8yej3 sand-dqyycr sand-2lah0s">
    <div className={isOverlayTone
      ? "sand-9f619 sand-78zum5 sand-6s0dn4 sand-889kno sand-cicffo sand-1a8lsjc sand-f18ygs sand-1n2onr6 sand-h8yej3 sand-193iq5w sand-2lah0s sand-ou54vl sand-p59q4u sand-1g0dm76 sand-2vl965 sand-1q4ynmn sand-1tiofj7 sand-vn2z4z sand-1gnnqk1 sand-1kj7bwx"
      : "sand-9f619 sand-78zum5 sand-6s0dn4 sand-889kno sand-cicffo sand-1a8lsjc sand-f18ygs sand-1n2onr6 sand-h8yej3 sand-193iq5w sand-2lah0s sand-ou54vl sand-p59q4u sand-1g0dm76 sand-2vl965 sand-1q4ynmn sand-1tiofj7 sand-vn2z4z sand-1gnnqk1"}>
      <span className={isOverlayTone ? "sand-1iyjqo2 sand-s83m0k sand-euugli sand-4z9k3i sand-d4r4e8 sand-5a26a2" : "sand-1iyjqo2 sand-s83m0k sand-euugli sand-4z9k3i sand-d4r4e8 sand-tyxrsu"}>{projection.label}</span>
      <TeachButton aria-label="Stop and save recording" className={`${STOP_RECORDING_STYLE}${isOverlayTone ? ` ${STOP_RECORDING_OVERLAY_STYLE}` : ""}`} leadingIcon="square" onClick={stopAndSave} title="Stop recording">{formatTeachRecordingDuration(projection.elapsedMs)}</TeachButton>
      <TeachIconButton aria-label="Discard recording" className={isOverlayTone ? DISCARD_RECORDING_OVERLAY_STYLE : DISCARD_RECORDING_STYLE} icon="close" label="Discard recording" onClick={() => void actions.stop(projection.agentId, false)} />
    </div>
  </div>;
}

function ArmedControls({ agentId, entryPoint, subjectLabel, actions }: { agentId: string; entryPoint: string; subjectLabel: string; actions: TeachRecordingActions }): ReactNode {
  return <div className="sand-9f619 sand-78zum5 sand-1v2ro7d sand-h8yej3 sand-889kno sand-cicffo sand-1a8lsjc sand-f18ygs sand-1q4ynmn sand-1yx5i47 sand-vn2z4z">
    <span className="sand-1iyjqo2 sand-s83m0k sand-euugli sand-4z9k3i sand-d4r4e8 sand-5a26a2">Record yourself doing a task. {subjectLabel} learns the steps and can run them again on its own.</span>
    <TeachButton className={RECORD_PILL_STYLE} onClick={() => { actions.arm(null); void actions.start(agentId, entryPoint ?? "screen_hover"); }} size="sm" variant="primary"><span className="sand-3nfvp2 sand-6s0dn4 sand-1jnr06f"><span className="sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-2lah0s sand-1xp8n7a sand-mix8c7"><TeachRecordingMark /></span><span>Start recording</span></span></TeachButton>
    <TeachIconButton className={DISMISS_STYLE} icon="close" label="Dismiss" onClick={() => actions.arm(null)} />
  </div>;
}

export function TeachRecordingControls({ actions, agentId, armed, isTeachTaskAvailable, isOverlayTone = false, nowMs, onStopAndSave, recordingAgentName, snapshot, subjectLabel }: TeachRecordingControlsProps): ReactNode {
  const projection = projectTeachRecording({ agentId, armed, isTeachTaskAvailable, nowMs, recordingAgentName, snapshot, subjectLabel });
  if (projection.kind === "hidden") return null;
  return projection.kind === "recording"
    ? <RecordingControls actions={actions} isOverlayTone={isOverlayTone} onStopAndSave={onStopAndSave} projection={projection} />
    : <ArmedControls actions={actions} agentId={projection.agentId} entryPoint={projection.entryPoint} subjectLabel={subjectLabel} />;
}

export function TeachRecordingFrame({ agentId, snapshot }: { agentId: string | null; snapshot: TeachRecordingStatus }): ReactNode {
  if (agentId == null || snapshot.state !== "recording" || snapshot.agentId !== agentId) return null;
  return <div aria-hidden="true" className="sand-10l6tqk sand-10a8y8t sand-9f619 sand-2u8bby sand-dh2fpr sand-1y0btm7 sand-jz30o7 sand-47corl sand-1u8a7rm" data-recording-frame="true" />;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=4837308-4842829 (regular ComputerPreview recording branch)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=6074212-6080513 (Windows regular ComputerPreview recording parity)
export function TeachRecordingPreviewFrame({ projection, actions }: { projection: TeachRecordingPreviewProjection | null; actions: TeachRecordingActions }): ReactNode {
  if (projection == null || !projection.isOwn) return null;
  return <>
    <span aria-hidden="true" className="sand-10l6tqk sand-10a8y8t sand-9f619 sand-2u8bby sand-dh2fpr sand-1y0btm7 sand-jz30o7 sand-47corl sand-zkaem6" data-recording-frame="true" />
    <span className="sand-10l6tqk sand-fr5jun sand-ncym2f sand-zkaem6 sand-3nfvp2 sand-17d4w8g sand-1kogg8i sand-j8oexa sand-dqyycr sand-1icupl1 sand-104s22n sand-1j6dyjg sand-xzm5a7 sand-ss6m8b sand-47corl">● REC {formatTeachRecordingDuration(projection.elapsedMs)}</span>
    <span className="sand-10l6tqk sand-1jn9clo sand-1nrll8i sand-uuh30 sand-zkaem6"><TeachButton onClick={() => void actions.stop(projection.agentId, true)} size="sm" variant="primary">Stop &amp; save</TeachButton></span>
  </>;
}

export function TeachRecordingPreviewPeerRow({ projection, actions }: { projection: TeachRecordingPreviewProjection | null; actions: TeachRecordingActions }): ReactNode {
  if (projection == null || projection.isOwn) return null;
  return <div className="sand-78zum5 sand-6s0dn4 sand-pkkfsy sand-h8yej3">
    <span className="sand-1iyjqo2 sand-s83m0k sand-euugli sand-4z9k3i sand-d4r4e8 sand-tyxrsu">{projection.label}</span>
    <span className="sand-78zum5 sand-6s0dn4 sand-11twubx sand-2lah0s">
      <TeachButton aria-label="Stop and save recording" onClick={() => void actions.stop(projection.agentId, true)} size="sm" variant="primary">Stop &amp; save</TeachButton>
      <TeachIconButton aria-label="Discard recording" icon="close" label="Discard recording" onClick={() => void actions.stop(projection.agentId, false)} />
    </span>
  </div>;
}

export interface TeachRecordingTopBarProps {
  isFullscreen: boolean;
  onExitFullscreen: () => void;
  onStartTeach?: (() => void) | null;
  platform: NodeJS.Platform;
}

export function TeachRecordingTopBar({ isFullscreen, onExitFullscreen, onStartTeach, platform }: TeachRecordingTopBarProps): ReactNode {
  const macWindowInset = platform === "darwin" && !isFullscreen;
  return <div className={macWindowInset
    ? "sand-1n2onr6 sand-9f619 sand-78zum5 sand-167g77z sand-2lah0s sand-h8yej3 sand-n3w4p2 sand-163pfp sand-lkep63 sand-8qq8ib"
    : "sand-1n2onr6 sand-9f619 sand-78zum5 sand-167g77z sand-2lah0s sand-h8yej3 sand-n3w4p2 sand-lkep63 sand-8qq8ib sand-147cf0h"}>
    <span aria-hidden="true" className="sand-1iyjqo2 sand-s83m0k sand-kh2ocl sand-euugli sand-avu8j0 sand-1wfn6di" />
    <div className="sand-computer-top-bar__actions sand-78zum5 sand-6s0dn4 sand-167g77z sand-2lah0s sand-lvsv26 sand-482pwi">
      {onStartTeach == null ? null : <TeachButton className="sand-2eai4v sand-4hv7ue sand-1y0btm7 sand-1flfzmt sand-fungia" onClick={onStartTeach} size="sm" variant="secondary"><span className="sand-3nfvp2 sand-6s0dn4 sand-1jnr06f"><span className="sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-2lah0s sand-1xp8n7a sand-mix8c"><TeachRecordingMark /></span>Teach a task</span></TeachButton>}
      <TeachIconButton className="sand-99e291 sand-1v0sr2s" icon="arrows-contract-simple" label="Exit fullscreen" onClick={onExitFullscreen} />
    </div>
  </div>;
}

export function TeachRecordingStoreView({ store, ...props }: TeachRecordingStoreViewProps): ReactNode {
  const snapshot = useSyncExternalStore(store.snapshots.subscribe, store.snapshots.get, store.snapshots.get);
  const armed = useSyncExternalStore(store.armed.subscribe, store.armed.get, store.armed.get);
  const nowMs = useSyncExternalStore(store.nowMs.subscribe, store.nowMs.get, store.nowMs.get);
  return <TeachRecordingControls {...props} actions={{ arm: store.arm, start: store.start, stop: store.stop }} armed={armed} nowMs={nowMs} snapshot={snapshot} />;
}
