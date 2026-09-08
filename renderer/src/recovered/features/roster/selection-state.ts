import type { AgentDesktopBridge } from "../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=777400 (selection.last-agent client slice)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=817849 (selection initial state and load-pending bit)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=817907 (selection transition and open request decision)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=818166 (settle matching selected agent)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=818256 (host/session settle guard)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=818386 (roster-complete fallback ordering)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=819190 (selection owner, restore, persistence, and reset)

export const ROSTER_SELECTION_SLICE = {
  slice: "selection.last-agent",
  schemaVersion: 1,
  scope: "client-persisted",
  accountSensitive: true
} as const;

export interface RosterSelectionState {
  readonly currentAgentId: string | null;
  readonly isLoadPending: boolean;
}

export interface RosterSelectionPersistence {
  read(accountSlot: string): Promise<
    | { kind: "absent" }
    | { kind: "corrupt" }
    | { kind: "envelope"; schemaVersion: number; value: unknown }
  >;
  write(accountSlot: string, value: RosterSelectionState): Promise<void>;
  clear(accountSlot: string): Promise<void>;
}

export interface RosterSelectionStore {
  get(): RosterSelectionState;
  subscribe(listener: () => void): () => void;
  select(agentId: string | null): boolean;
  settle(agentId: string): void;
  reconcile(input: { agentIds: readonly string[]; isRosterComplete: boolean }): void;
  restore(accountSlot: string | null): Promise<void>;
  reset(): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeAccountSlot(accountSlot: string): string {
  return encodeURIComponent(accountSlot).replaceAll(".", "%2E");
}

export function rosterSelectionPersistenceKey(accountSlot: string): string {
  if (accountSlot.length === 0) throw new Error("accountSlot must not be empty");
  return `sand.client.slice.account.${encodeAccountSlot(accountSlot)}.${ROSTER_SELECTION_SLICE.slice}`;
}

function parseSelectionState(value: unknown): RosterSelectionState | null {
  if (!isRecord(value)) return null;
  const agentId = value.agentId;
  return typeof agentId === "string" && agentId.length > 0 ? { currentAgentId: agentId, isLoadPending: false } : null;
}

function parseEnvelope(value: string | null):
  | { kind: "absent" }
  | { kind: "corrupt" }
  | { kind: "envelope"; schemaVersion: number; value: unknown } {
  if (value == null) return { kind: "absent" };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || typeof parsed.schemaVersion !== "number" || !("value" in parsed)) return { kind: "corrupt" };
    return { kind: "envelope", schemaVersion: parsed.schemaVersion, value: parsed.value };
  } catch {
    return { kind: "corrupt" };
  }
}

export function createRosterSelectionPersistence(clientPersistence: AgentDesktopBridge["clientPersistence"]): RosterSelectionPersistence {
  return {
    async read(accountSlot) {
      return parseEnvelope(await clientPersistence.read(rosterSelectionPersistenceKey(accountSlot)));
    },
    async write(accountSlot, value) {
      await clientPersistence.write(
        rosterSelectionPersistenceKey(accountSlot),
        JSON.stringify({ schemaVersion: ROSTER_SELECTION_SLICE.schemaVersion, value: { agentId: value.currentAgentId } })
      );
    },
    clear: (accountSlot) => clientPersistence.remove(rosterSelectionPersistenceKey(accountSlot))
  };
}

export function createRosterSelectionStore(persistence: RosterSelectionPersistence): RosterSelectionStore {
  let state: RosterSelectionState = { currentAgentId: null, isLoadPending: false };
  let completeRosterAgentIds: readonly string[] | null = null;
  let accountSlot: string | null = null;
  let generation = 0;
  let disposed = false;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  const replaceState = (next: RosterSelectionState): void => {
    if (state.currentAgentId === next.currentAgentId && state.isLoadPending === next.isLoadPending) return;
    state = { currentAgentId: next.currentAgentId, isLoadPending: next.isLoadPending };
    emit();
  };
  const enqueueWrite = (next: RosterSelectionState): void => {
    if (accountSlot == null) return;
    const slot = accountSlot;
    writes = writes.then(() => persistence.write(slot, next)).catch(() => {});
  };
  const isCurrent = (expectedGeneration: number, expectedSlot: string): boolean =>
    !disposed && generation === expectedGeneration && accountSlot === expectedSlot;

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select(agentId) {
      if (disposed) return false;
      const next = agentId == null || agentId.length === 0 ? null : agentId;
      if (next === state.currentAgentId) return next != null && !state.isLoadPending;
      replaceState({ currentAgentId: next, isLoadPending: next != null });
      enqueueWrite(state);
      return next != null;
    },
    settle(agentId) {
      if (disposed || state.currentAgentId !== agentId || !state.isLoadPending) return;
      const nextAgentId = completeRosterAgentIds == null || completeRosterAgentIds.includes(agentId)
        ? agentId
        : completeRosterAgentIds[0] ?? null;
      replaceState({ currentAgentId: nextAgentId, isLoadPending: false });
      if (nextAgentId !== agentId) enqueueWrite(state);
    },
    reconcile({ agentIds, isRosterComplete }) {
      if (disposed || !isRosterComplete) return;
      completeRosterAgentIds = [...agentIds];
      const available = new Set(agentIds);
      if (state.currentAgentId != null && !available.has(state.currentAgentId) && state.isLoadPending) return;
      if (state.currentAgentId != null && available.has(state.currentAgentId)) return;
      const nextAgentId = state.currentAgentId != null && available.has(state.currentAgentId)
        ? state.currentAgentId
        : agentIds[0] ?? null;
      if (nextAgentId === state.currentAgentId && !state.isLoadPending) return;
      replaceState({ currentAgentId: nextAgentId, isLoadPending: false });
      enqueueWrite(state);
    },
    async restore(nextAccountSlot) {
      generation += 1;
      const expectedGeneration = generation;
      accountSlot = nextAccountSlot;
      completeRosterAgentIds = null;
      replaceState({ currentAgentId: null, isLoadPending: false });
      if (disposed || nextAccountSlot == null) return;
      await writes;
      if (!isCurrent(expectedGeneration, nextAccountSlot)) return;
      const stored = await persistence.read(nextAccountSlot);
      if (!isCurrent(expectedGeneration, nextAccountSlot)) return;
      if (stored.kind === "absent") return;
      const restored = stored.kind === "envelope" && stored.schemaVersion === ROSTER_SELECTION_SLICE.schemaVersion
        ? parseSelectionState(stored.value)
        : null;
      if (restored == null) {
        await persistence.clear(nextAccountSlot);
        return;
      }
      replaceState(restored);
    },
    reset() {
      generation += 1;
      accountSlot = null;
      completeRosterAgentIds = null;
      replaceState({ currentAgentId: null, isLoadPending: false });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      accountSlot = null;
      completeRosterAgentIds = null;
      listeners.clear();
    }
  };
}
