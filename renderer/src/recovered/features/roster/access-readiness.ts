// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5510157 (roster load/sidebar projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5543963 (AccessCover roster gate)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=822635 (selected roster agent)

export type RosterTransportState = "browser" | "connecting" | "connected" | "down";
export type RosterLoadState = "loading" | "ready" | "error";

export interface RosterFailureSnapshot {
  readonly code: string;
  readonly transportKind?: string;
}

export interface RosterAccessReadinessInput {
  readonly accountKey: string | null;
  readonly transport: RosterTransportState;
  readonly loadState: RosterLoadState;
  readonly hasLoadedAgents: boolean;
  readonly agentIds: readonly string[];
  readonly selectedAgentId: string | null;
  readonly failure: RosterFailureSnapshot | null;
  readonly isShowingRestoredRoster: boolean;
  readonly isPrivacyBlocked: boolean;
}

export interface RosterAccessReadiness {
  readonly accountKey: string | null;
  readonly isAccountBound: boolean;
  readonly isConnected: boolean;
  readonly isLoaded: boolean;
  readonly hasReachedBox: boolean;
  readonly hasSelectedAgent: boolean;
  readonly isSelectionReady: boolean;
  readonly rosterFailureCode: string | null;
  readonly rosterFailureTransportKind: string | null;
  readonly isShowingRestoredRoster: boolean;
  readonly isPrivacyBlocked: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function projectRosterFailure(value: unknown): RosterFailureSnapshot | null {
  const record = asRecord(value);
  if (typeof record?.code !== "string" || record.code.length === 0) return null;
  return typeof record.transportKind === "string"
    ? { code: record.code, transportKind: record.transportKind }
    : { code: record.code };
}

export function selectRosterAccessReadiness(input: RosterAccessReadinessInput): RosterAccessReadiness {
  const isAccountBound = input.accountKey != null;
  const hasSelectedAgent = isAccountBound && input.selectedAgentId != null && input.agentIds.includes(input.selectedAgentId);
  const isLoaded = isAccountBound && input.hasLoadedAgents && input.loadState === "ready";
  const isConnected = isAccountBound && input.transport === "connected";
  return {
    accountKey: input.accountKey,
    isAccountBound,
    isConnected,
    isLoaded,
    // The shipped first-box latch remains true after the first ready roster,
    // including while a later refresh is down or showing a restored snapshot.
    hasReachedBox: isAccountBound && input.hasLoadedAgents,
    hasSelectedAgent,
    isSelectionReady: isLoaded && isConnected && hasSelectedAgent,
    rosterFailureCode: input.failure?.code ?? null,
    rosterFailureTransportKind: input.failure?.transportKind ?? null,
    isShowingRestoredRoster: input.isShowingRestoredRoster,
    isPrivacyBlocked: input.isPrivacyBlocked
  };
}
