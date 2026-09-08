import { isComputerRebuildLocked as projectComputerRebuildLocked, type ComputerRebuildState } from "./computer-rebuild-model";
import { shouldShowAccessCover, type SandAccess } from "./model";
import type { FirstBoxGateState } from "./first-box-gate";
import type { RosterSnapshot } from "./roster-snapshot-store";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5536861
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5596325
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export interface AccessCoverCompositionInput {
  readonly access: SandAccess;
  readonly roster: Pick<RosterSnapshot, "failure" | "isShowingRestoredRoster" | "loadState" | "isFetching">;
  readonly firstBox: FirstBoxGateState;
  readonly rebuildStates: readonly Pick<ComputerRebuildState, "kind">[];
}

export interface AccessCoverCompositionState {
  readonly access: SandAccess;
  readonly rosterFailureCode: string | null;
  readonly hasReachedBox: boolean;
  readonly isShowingRestoredRoster: boolean;
  readonly isComputerRebuildLocked: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isVisible: boolean;
}

export function projectAccessCoverComposition(input: AccessCoverCompositionInput): AccessCoverCompositionState {
  const isComputerRebuildLocked = input.rebuildStates.some((state) => projectComputerRebuildLocked(state as ComputerRebuildState));
  const rosterFailureCode = input.roster.failure?.code ?? null;
  const isLoading = input.access.state === "checking"
    || input.roster.loadState === "loading"
    || input.roster.isFetching;
  const isError = input.roster.loadState === "error" || input.access.state === "unknown";
  const isVisible = shouldShowAccessCover({
    rosterFailureCode,
    hasReachedBox: input.firstBox.hasReachedBox,
    isShowingRestoredRoster: input.roster.isShowingRestoredRoster,
    isComputerRebuildLocked
  });
  return {
    access: input.access,
    rosterFailureCode,
    hasReachedBox: input.firstBox.hasReachedBox,
    isShowingRestoredRoster: input.roster.isShowingRestoredRoster,
    isComputerRebuildLocked,
    isLoading,
    isError,
    isVisible
  };
}
