// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5583000
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5586208
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5587412
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5576460 (getAgentAutomations)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5577220 (setAgentAutomationEnabled)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5577276 (createAgentAutomation)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5577328 (updateAgentAutomation)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5577380 (deleteAgentAutomation)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5577432 (runAgentAutomationNow)

export type RoutineRunStatus = "running" | "ok" | "error";

export interface RoutineRun {
  readonly id: string;
  readonly status: RoutineRunStatus;
  readonly startedAt: number;
  readonly detail?: string | null;
  readonly event?: string | null;
}

export interface RoutineTrigger {
  readonly [key: string]: unknown;
}

export interface RoutineAutomation {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly trigger: RoutineTrigger;
  readonly triggerDescription: string;
  readonly isEnabled: boolean;
  readonly runs: readonly RoutineRun[];
  readonly createdAt?: number;
}

export type RoutineSnapshot =
  | { readonly status: "loading"; readonly value: readonly RoutineAutomation[]; readonly previous?: readonly RoutineAutomation[] }
  | { readonly status: "empty"; readonly value: readonly [] }
  | { readonly status: "ready"; readonly value: readonly RoutineAutomation[] }
  | { readonly status: "failed"; readonly value: readonly RoutineAutomation[]; readonly previous?: readonly RoutineAutomation[]; readonly error: unknown }
  | { readonly status: "unavailable"; readonly value: readonly [] };

export interface RoutineSpec {
  readonly name: string;
  readonly prompt: string;
  readonly trigger: RoutineTrigger;
  readonly isEnabled: boolean;
}

export interface RoutineSource {
  getAgentAutomations(args: { readonly id: string }): Promise<unknown>;
  createAgentAutomation(args: { readonly id: string; readonly spec: RoutineSpec }): Promise<unknown>;
  setAgentAutomationEnabled(args: { readonly id: string; readonly automationId: string; readonly isEnabled: boolean }): Promise<unknown>;
  updateAgentAutomation(args: { readonly id: string; readonly automationId: string; readonly spec: RoutineSpec }): Promise<unknown>;
  deleteAgentAutomation(args: { readonly id: string; readonly automationId: string }): Promise<unknown>;
  runAgentAutomationNow(args: { readonly id: string; readonly automationId: string }): Promise<unknown>;
}

export interface AutomationsEvent {
  readonly agentId: string;
  readonly automations: unknown;
}

interface AgentState {
  value: RoutineAutomation[] | null;
  error: unknown | null;
  refreshing: boolean;
  request: number;
  createPending: boolean;
  pending: Set<string>;
  mutationErrors: Map<string, unknown>;
  runPending: Set<string>;
  snapshot: RoutineSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRun(value: unknown): RoutineRun | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.status !== "string" || typeof value.startedAt !== "number") return null;
  if (value.status !== "running" && value.status !== "ok" && value.status !== "error") return null;
  return {
    id: value.id,
    status: value.status,
    startedAt: value.startedAt,
    ...(typeof value.detail === "string" || value.detail === null ? { detail: value.detail } : {}),
    ...(typeof value.event === "string" || value.event === null ? { event: value.event } : {})
  };
}

function parseAutomation(value: unknown): RoutineAutomation | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.prompt !== "string" || !isRecord(value.trigger) || typeof value.triggerDescription !== "string" || typeof value.isEnabled !== "boolean" || !Array.isArray(value.runs)) return null;
  const runs = value.runs.map(parseRun);
  if (runs.some((run): run is null => run === null)) return null;
  return {
    id: value.id,
    name: value.name,
    prompt: value.prompt,
    trigger: value.trigger,
    triggerDescription: value.triggerDescription,
    isEnabled: value.isEnabled,
    runs: runs as RoutineRun[],
    ...(typeof value.createdAt === "number" ? { createdAt: value.createdAt } : {})
  };
}

function parseAutomations(value: unknown): RoutineAutomation[] {
  if (!Array.isArray(value)) throw new Error("Malformed routines response");
  const parsed = value.map(parseAutomation);
  if (parsed.some((automation): automation is null => automation === null)) throw new Error("Malformed routines response");
  return parsed as RoutineAutomation[];
}

function initialState(): AgentState {
  return { value: null, error: null, refreshing: false, request: 0, createPending: false, pending: new Set(), mutationErrors: new Map(), runPending: new Set(), snapshot: { status: "loading", value: [] } };
}

function isCapabilityUnavailable(error: unknown): boolean {
  return isRecord(error) && error.code === "source/capability-unavailable";
}

function publish(state: AgentState): void {
  if (state.error != null) {
    if (isCapabilityUnavailable(state.error)) {
      state.snapshot = { status: "unavailable", value: [] };
    } else if (state.value == null) {
      state.snapshot = { status: "failed", value: [], error: state.error };
    } else {
      state.snapshot = { status: "failed", value: state.value, previous: state.value, error: state.error };
    }
  } else if (state.value == null || state.refreshing && state.value.length === 0) {
    state.snapshot = { status: "loading", value: [] };
  } else if (state.value.length === 0) {
    state.snapshot = { status: "empty", value: [] };
  } else {
    state.snapshot = { status: "ready", value: state.value };
  }
}

/**
 * Renderer-side lifecycle for the shipped Routines info-pane contract.
 * It intentionally owns data/pending/cleanup semantics only; the root info
 * pane mount stays with its active owner.
 */
export function createRoutinesController(source: RoutineSource) {
  const states = new Map<string, AgentState>();
  const listeners = new Set<() => void>();
  let disposed = false;
  let epoch = 0;

  const stateFor = (agentId: string): AgentState => {
    let state = states.get(agentId);
    if (state == null) {
      state = initialState();
      states.set(agentId, state);
    }
    return state;
  };
  const notify = () => { if (!disposed) for (const listener of listeners) listener(); };
  const snapshot = (agentId: string): RoutineSnapshot => stateFor(agentId).snapshot;
  const createPending = (agentId: string): boolean => stateFor(agentId).createPending;
  const refresh = async (agentId: string): Promise<readonly RoutineAutomation[]> => {
    if (disposed) return snapshot(agentId).value;
    const state = stateFor(agentId);
    const request = ++state.request;
    state.error = null;
    state.refreshing = true;
    publish(state);
    notify();
    try {
      const value = parseAutomations(await source.getAgentAutomations({ id: agentId }));
      if (disposed || request !== state.request) return snapshot(agentId).value;
      state.value = value;
      state.error = null;
      state.refreshing = false;
      publish(state);
      notify();
      return value;
    } catch (error) {
      if (!disposed && request === state.request) {
        state.error = error;
        state.refreshing = false;
        publish(state);
        notify();
      }
      throw error;
    }
  };
  const runPending = (agentId: string, automationId: string): boolean => stateFor(agentId).runPending.has(automationId);
  const pending = (agentId: string, automationId: string): boolean => stateFor(agentId).pending.has(automationId);
  const mutationError = (agentId: string, automationId: string | "create"): unknown | null => stateFor(agentId).mutationErrors.get(automationId) ?? null;
  const withPending = async <Value>(agentId: string, automationId: string, operation: () => Promise<Value>): Promise<Value | undefined> => {
    const state = stateFor(agentId);
    if (state.pending.has(automationId)) return undefined;
    state.pending.add(automationId);
    state.mutationErrors.delete(automationId);
    notify();
    try {
      const value = await operation();
      if (!disposed) await refresh(agentId);
      return value;
    } catch (error) {
      if (!disposed) state.mutationErrors.set(automationId, error);
      notify();
      throw error;
    } finally {
      state.pending.delete(automationId);
      notify();
    }
  };
  return {
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot,
    createPending,
    pending,
    runPending,
    mutationError,
    refresh,
    async create(agentId: string, spec: RoutineSpec): Promise<RoutineAutomation | null> {
      const state = stateFor(agentId);
      if (disposed || state.createPending) return null;
      state.createPending = true;
      state.mutationErrors.delete("create");
      notify();
      const operationEpoch = epoch;
      try {
        const value = parseAutomations(await source.createAgentAutomation({ id: agentId, spec }));
        if (disposed || operationEpoch !== epoch) return null;
        state.value = value;
        state.error = null;
        publish(state);
        notify();
        return value.find((automation) => automation.name === spec.name) ?? null;
      } catch (error) {
        if (!disposed) state.mutationErrors.set("create", error);
        notify();
        throw error;
      } finally {
        state.createPending = false;
        notify();
      }
    },
    setEnabled(agentId: string, automationId: string, isEnabled: boolean): Promise<unknown | undefined> {
      return withPending(agentId, automationId, () => source.setAgentAutomationEnabled({ id: agentId, automationId, isEnabled }));
    },
    update(agentId: string, automationId: string, spec: RoutineSpec): Promise<unknown | undefined> {
      return withPending(agentId, automationId, () => source.updateAgentAutomation({ id: agentId, automationId, spec }));
    },
    remove(agentId: string, automationId: string): Promise<unknown | undefined> {
      return withPending(agentId, automationId, async () => {
        const result = await source.deleteAgentAutomation({ id: agentId, automationId });
        const state = stateFor(agentId);
        if (state.value != null) state.value = state.value.filter((automation) => automation.id !== automationId);
        return result;
      });
    },
    async runNow(agentId: string, automationId: string): Promise<void> {
      const state = stateFor(agentId);
      if (disposed || state.runPending.has(automationId)) return;
      state.runPending.add(automationId);
      const operationEpoch = epoch;
      notify();
      try {
        await source.runAgentAutomationNow({ id: agentId, automationId });
        if (!disposed && operationEpoch === epoch) await refresh(agentId);
      } finally {
        state.runPending.delete(automationId);
        notify();
      }
    },
    ingest(event: AutomationsEvent): void {
      if (disposed) return;
      const state = stateFor(event.agentId);
      state.value = parseAutomations(event.automations);
      state.error = null;
      state.refreshing = false;
      publish(state);
      notify();
    },
    reset(): void {
      epoch += 1;
      for (const state of states.values()) {
        state.request += 1;
        state.pending.clear();
        state.mutationErrors.clear();
        state.runPending.clear();
        state.refreshing = false;
        state.value = null;
        state.error = null;
        publish(state);
      }
      notify();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      epoch += 1;
      listeners.clear();
      for (const state of states.values()) {
        state.request += 1;
        state.pending.clear();
        state.mutationErrors.clear();
        state.runPending.clear();
      }
    }
  };
}

export type RoutinesController = ReturnType<typeof createRoutinesController>;
