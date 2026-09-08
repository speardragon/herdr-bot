import { ACCESS_BLOCKED_FAILURE_CODE } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5325097
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export type FirstBoxRosterLoadState = "loading" | "ready" | "error";

export interface FirstBoxRosterSnapshot {
  readonly loadState: FirstBoxRosterLoadState;
  readonly isShowingRestoredRoster: boolean;
  readonly failureCode: string | null;
  readonly failureTransportKind: string | null;
}

export interface FirstBoxGateState {
  readonly isAwaitingFirstBox: boolean;
  readonly hasReachedBox: boolean;
}

export const INITIAL_FIRST_BOX_GATE: FirstBoxGateState = {
  isAwaitingFirstBox: false,
  hasReachedBox: false
};

function isConnectivityFailure(transportKind: string | null): boolean {
  return transportKind === "network" || transportKind === "dns";
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5325097
export function projectFirstBoxGate(previous: FirstBoxGateState, roster: FirstBoxRosterSnapshot): FirstBoxGateState {
  const hasReachedBox = previous.hasReachedBox || roster.loadState === "ready";
  const isSuppressed = roster.isShowingRestoredRoster
    || roster.failureCode === ACCESS_BLOCKED_FAILURE_CODE
    || isConnectivityFailure(roster.failureTransportKind);
  return {
    hasReachedBox,
    isAwaitingFirstBox: roster.loadState !== "loading" && !hasReachedBox && !isSuppressed
  };
}

export function resetFirstBoxGate(): FirstBoxGateState {
  return INITIAL_FIRST_BOX_GATE;
}
