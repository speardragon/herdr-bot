// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4537836
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4544056
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5603486
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export type ComputerRebuildKind = "update" | "reset" | "recover" | "reconnecting";
export type ComputerRebuildUpdateSource = "auto" | "request" | "migration";
export type ComputerRebuildTeardown = "none" | "transport" | "box";
export type ComputerRebuildResolution = "settled" | "failed" | "cancelled";

export interface ComputerRebuildOperationId {
  readonly value: string;
}

export interface ComputerRebuildState {
  readonly kind: ComputerRebuildKind | null;
  readonly operationId: ComputerRebuildOperationId | null;
  readonly updateSource: ComputerRebuildUpdateSource | null;
  readonly lockBoxId: string | null;
  readonly isPending: boolean;
  readonly hasRequestAcknowledgement: boolean;
  readonly imageUpdateAvailable: boolean | undefined;
  readonly expectsImageUpgrade: boolean;
  readonly boxPhase: string | null;
  readonly observedBoxId: string | null;
  readonly lastHealthyBoxId: string | null;
  readonly hasLeftHealthy: boolean;
  readonly teardownObserved: ComputerRebuildTeardown;
  readonly reconnectedSinceLeft: boolean;
  readonly readySince: number | null;
  readonly isConnected: boolean;
  readonly connectedSince: number | null;
  readonly resetOperationId: ComputerRebuildOperationId | null;
  readonly hasTerminalMigration: boolean;
  readonly lastResolution: ComputerRebuildResolution | null;
  readonly lastResolutionKind: ComputerRebuildKind | null;
}

export type ComputerRebuildEvent =
  | { readonly type: "request"; readonly kind: ComputerRebuildKind; readonly operationId?: ComputerRebuildOperationId | null; readonly source?: ComputerRebuildUpdateSource | null; readonly at: number }
  | { readonly type: "pending"; readonly isPending: boolean; readonly at: number }
  | { readonly type: "acknowledged"; readonly at: number }
  | { readonly type: "image-update"; readonly available: boolean | undefined; readonly at: number }
  | { readonly type: "box"; readonly boxId: string | null; readonly phase: string | null; readonly at: number }
  | { readonly type: "migration"; readonly operationId: ComputerRebuildOperationId | null; readonly phase: "backing-up" | "creating" | "moving" | "cleaning-up" | "wiping" | "done" | "failed"; readonly at: number }
  | { readonly type: "connection"; readonly isConnected: boolean; readonly at: number }
  | { readonly type: "error"; readonly at: number }
  | { readonly type: "deactivate"; readonly at: number }
  | { readonly type: "tick"; readonly at: number };

const TERMINAL_CLEAR: Pick<ComputerRebuildState, "kind" | "operationId" | "updateSource" | "lockBoxId" | "hasLeftHealthy" | "teardownObserved" | "reconnectedSinceLeft" | "readySince" | "resetOperationId" | "hasTerminalMigration" | "hasRequestAcknowledgement" | "expectsImageUpgrade"> = {
  kind: null,
  operationId: null,
  updateSource: null,
  lockBoxId: null,
  hasLeftHealthy: false,
  teardownObserved: "none",
  reconnectedSinceLeft: false,
  readySince: null,
  resetOperationId: null,
  hasTerminalMigration: false,
  hasRequestAcknowledgement: false,
  expectsImageUpgrade: false
};

function isResetLike(kind: ComputerRebuildKind): boolean {
  return kind === "reset" || kind === "recover";
}

function isHealthyBoxPhase(phase: string | null): boolean {
  return phase === "running" || phase === "local";
}

function sameOperation(left: ComputerRebuildOperationId | null, right: ComputerRebuildOperationId | null): boolean {
  return left != null && right != null && left.value === right.value;
}

function sameBox(state: ComputerRebuildState): boolean {
  return state.lockBoxId == null || state.observedBoxId == null || state.observedBoxId === state.lockBoxId;
}

export function initialComputerRebuildState(boxPhase: string | null, imageUpdateAvailable?: boolean): ComputerRebuildState {
  return {
    kind: null,
    operationId: null,
    updateSource: null,
    lockBoxId: null,
    isPending: false,
    hasRequestAcknowledgement: false,
    imageUpdateAvailable,
    expectsImageUpgrade: false,
    boxPhase,
    observedBoxId: null,
    lastHealthyBoxId: null,
    hasLeftHealthy: false,
    teardownObserved: "none",
    reconnectedSinceLeft: false,
    readySince: null,
    isConnected: true,
    connectedSince: null,
    resetOperationId: null,
    hasTerminalMigration: false,
    lastResolution: null,
    lastResolutionKind: null
  };
}

function request(state: ComputerRebuildState, event: Extract<ComputerRebuildEvent, { type: "request" }>): ComputerRebuildState {
  const isReconnecting = event.kind === "reconnecting";
  const operationId = isResetLike(event.kind) ? event.operationId ?? null : null;
  const updateSource = event.kind === "update" ? event.source ?? null : null;
  const hasHealthyTransition = isReconnecting || isResetLike(event.kind);
  const preservesReadySince = event.kind === "update" && state.kind == null && state.isPending;

  if (state.kind != null) {
    if (event.kind === "reset" && state.kind !== "reset" || event.kind === "recover" && state.kind !== "recover" && state.kind !== "reset") {
      return {
        ...state,
        kind: event.kind,
        operationId,
        updateSource,
        lockBoxId: state.observedBoxId,
        resetOperationId: operationId,
        hasLeftHealthy: true,
        reconnectedSinceLeft: false,
        readySince: null,
        hasTerminalMigration: false,
        hasRequestAcknowledgement: false,
        expectsImageUpgrade: false
      };
    }
    if (isResetLike(event.kind)) {
      if (event.kind === "recover" && state.kind === "reset" || sameOperation(state.resetOperationId, event.operationId ?? null)) return state;
      return {
        ...state,
        operationId: event.operationId ?? null,
        updateSource: null,
        resetOperationId: event.operationId ?? null,
        readySince: null,
        hasTerminalMigration: false,
        hasRequestAcknowledgement: false,
        expectsImageUpgrade: false
      };
    }
    if (state.kind === "reconnecting" && !isReconnecting) {
      return {
        ...state,
        kind: event.kind,
        updateSource,
        lockBoxId: state.observedBoxId,
        expectsImageUpgrade: event.kind === "update" && state.imageUpdateAvailable === true
      };
    }
    if (state.kind === "update" && event.kind === "update" && state.updateSource === "auto" && event.source !== "auto") {
      return { ...state, updateSource };
    }
    return state;
  }

  const readySince = preservesReadySince
    ? state.readySince
    : !hasHealthyTransition && isHealthyBoxPhase(state.boxPhase) ? event.at : null;
  return {
    ...state,
    kind: event.kind,
    operationId,
    updateSource,
    lockBoxId: state.observedBoxId,
    hasLeftHealthy: hasHealthyTransition || preservesReadySince && state.hasLeftHealthy,
    connectedSince: state.isConnected ? state.connectedSince ?? event.at : null,
    reconnectedSinceLeft: preservesReadySince && state.reconnectedSinceLeft,
    resetOperationId: operationId,
    hasTerminalMigration: false,
    hasRequestAcknowledgement: preservesReadySince && state.hasRequestAcknowledgement,
    expectsImageUpgrade: event.kind === "update" && (state.expectsImageUpgrade || state.imageUpdateAvailable === true),
    readySince,
    lastResolution: null,
    lastResolutionKind: null
  };
}

export function reduceComputerRebuildState(state: ComputerRebuildState, event: ComputerRebuildEvent): ComputerRebuildState {
  switch (event.type) {
    case "request":
      return request(state, event);
    case "pending":
      return !event.isPending && state.kind == null
        ? { ...state, ...TERMINAL_CLEAR, isPending: false }
        : { ...state, isPending: event.isPending };
    case "acknowledged":
      return state.kind === "update" || state.kind === "reset" || state.kind === "recover"
        ? { ...state, hasRequestAcknowledgement: true }
        : state;
    case "image-update":
      return { ...state, imageUpdateAvailable: event.available };
    case "box": {
      if (event.boxId === state.observedBoxId && event.phase === state.boxPhase) return state;
      const autoUpdateMovedBox = state.kind === "update" && state.updateSource === "auto" && state.observedBoxId != null && event.boxId != null && event.boxId !== state.observedBoxId;
      const afterDeactivate = autoUpdateMovedBox ? reduceComputerRebuildState(state, { type: "deactivate", at: event.at }) : state;
      const withObserved = {
        ...afterDeactivate,
        observedBoxId: event.boxId,
        lastHealthyBoxId: isHealthyBoxPhase(event.phase) ? event.boxId : afterDeactivate.lastHealthyBoxId
      };
      const autoUpdate = state.kind == null && !state.isPending && event.phase === "pulling" && state.lastHealthyBoxId != null && state.lastHealthyBoxId === event.boxId
        ? reduceComputerRebuildState(withObserved, { type: "request", kind: "update", source: "auto", at: event.at })
        : withObserved;
      if (autoUpdate.kind == null) return { ...autoUpdate, boxPhase: event.phase };
      const withLockBox = autoUpdate.lockBoxId == null && event.boxId != null ? { ...autoUpdate, lockBoxId: event.boxId } : autoUpdate;
      return sameBox(withLockBox)
        ? isHealthyBoxPhase(event.phase)
          ? { ...withLockBox, boxPhase: event.phase, readySince: withLockBox.readySince ?? event.at }
          : { ...withLockBox, boxPhase: event.phase, hasLeftHealthy: true, teardownObserved: "box", readySince: null }
        : { ...withLockBox, boxPhase: event.phase, readySince: null };
    }
    case "migration": {
      if (event.phase === "failed") {
        if (state.kind == null || state.kind === "update" && state.isPending || isResetLike(state.kind) && !sameOperation(state.resetOperationId, event.operationId)) return state;
        return { ...state, ...TERMINAL_CLEAR, lastResolution: "failed", lastResolutionKind: state.kind };
      }
      if (event.phase === "done") {
        const isMigrationUpdate = state.kind === "update" && state.updateSource === "migration";
        if (!isResetLike(state.kind ?? "reconnecting") && !isMigrationUpdate) return state;
        const operationId = state.kind != null && isResetLike(state.kind) ? state.resetOperationId : state.operationId;
        if (!sameOperation(operationId, event.operationId) || state.hasTerminalMigration) return state;
        return {
          ...state,
          hasTerminalMigration: true,
          hasLeftHealthy: true,
          readySince: state.isConnected && isHealthyBoxPhase(state.boxPhase) && sameBox(state) ? event.at : null
        };
      }
      const kind: ComputerRebuildKind = event.phase === "wiping" ? "reset" : "update";
      const next = reduceComputerRebuildState(state, kind === "reset"
        ? { type: "request", kind, operationId: event.operationId, at: event.at }
        : { type: "request", kind, source: "migration", at: event.at });
      return event.operationId == null || next.kind == null || sameOperation(next.operationId, event.operationId)
        ? next
        : { ...next, operationId: event.operationId };
    }
    case "connection":
      if (state.kind == null && !(state.isPending && state.expectsImageUpgrade)) {
        return {
          ...state,
          isConnected: event.isConnected,
          connectedSince: event.isConnected ? state.connectedSince ?? event.at : null
        };
      }
      return event.isConnected
        ? {
            ...state,
            isConnected: true,
            connectedSince: state.connectedSince ?? event.at,
            reconnectedSinceLeft: state.hasLeftHealthy || state.reconnectedSinceLeft,
            readySince: state.hasLeftHealthy && isHealthyBoxPhase(state.boxPhase) && sameBox(state) ? state.readySince ?? event.at : state.readySince
          }
        : {
            ...state,
            isConnected: false,
            connectedSince: null,
            hasLeftHealthy: true,
            teardownObserved: state.teardownObserved === "none" ? "transport" : state.teardownObserved,
            readySince: null
          };
    case "error":
      return state.kind == null ? state : { ...state, ...TERMINAL_CLEAR, lastResolution: "failed", lastResolutionKind: state.kind };
    case "deactivate":
      if (state.kind == null) return state;
      if (state.kind === "update" && state.isPending) {
        return {
          ...state,
          ...TERMINAL_CLEAR,
          hasLeftHealthy: state.hasLeftHealthy,
          teardownObserved: state.teardownObserved,
          reconnectedSinceLeft: state.reconnectedSinceLeft,
          readySince: state.readySince,
          hasRequestAcknowledgement: state.hasRequestAcknowledgement,
          expectsImageUpgrade: state.expectsImageUpgrade,
          lastResolution: "cancelled",
          lastResolutionKind: state.kind
        };
      }
      return { ...state, ...TERMINAL_CLEAR, lastResolution: state.hasTerminalMigration ? "settled" : "cancelled", lastResolutionKind: state.kind };
    case "tick":
      return state;
  }
}

export function isComputerRebuildLocked(state: ComputerRebuildState): boolean {
  return state.kind != null;
}
