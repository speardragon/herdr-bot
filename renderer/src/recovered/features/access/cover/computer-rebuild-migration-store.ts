import type { DesktopBridge, Unsubscribe } from "../../../contracts/desktop-bridge";
import {
  reduceComputerRebuildState,
  type ComputerRebuildEvent,
  type ComputerRebuildOperationId,
  type ComputerRebuildState
} from "./computer-rebuild-model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=805443
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=806140
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=1067681
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=1068822
// Immutable Mac root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
// Immutable Windows root sha256: 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5

export type BoxMigrationPhase = "backing-up" | "creating" | "moving" | "cleaning-up" | "wiping" | "done" | "failed";

export interface BoxMigrationEvent {
  readonly operationId: ComputerRebuildOperationId | null;
  readonly phase: BoxMigrationPhase;
  readonly detail: string;
}

export interface BoxMigrationSnapshot {
  readonly operationId: ComputerRebuildOperationId | null;
  readonly phase: BoxMigrationPhase | null;
  readonly detail: string;
  readonly migrationPhases: readonly BoxMigrationPhase[];
}

export interface ComputerRebuildMigrationStore {
  get(): ComputerRebuildState;
  getMigration(): BoxMigrationEvent | null;
  getSnapshot(): BoxMigrationSnapshot;
  isHydrating(): boolean;
  subscribe(listener: () => void): Unsubscribe;
  connect(): Promise<void>;
  noteReconnect(): Promise<void>;
  reset(): void;
  dispose(): void;
}

const PHASES: ReadonlySet<string> = new Set(["backing-up", "creating", "moving", "cleaning-up", "wiping", "done", "failed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function operationId(value: unknown): ComputerRebuildOperationId | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.value !== "string" || value.value.length === 0) return null;
  return { value: value.value };
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=805443
export function parseBoxMigrationEvent(value: unknown): BoxMigrationEvent | null {
  if (!isRecord(value) || !PHASES.has(typeof value.phase === "string" ? value.phase : "") || typeof value.detail !== "string") return null;
  const parsedOperationId = operationId(value.operationId);
  if (value.operationId !== null && parsedOperationId === null) return null;
  return { operationId: parsedOperationId, phase: value.phase as BoxMigrationPhase, detail: value.detail };
}

const EMPTY_PHASES: readonly BoxMigrationPhase[] = [];
const EMPTY_SNAPSHOT: BoxMigrationSnapshot = { operationId: null, phase: null, detail: "", migrationPhases: EMPTY_PHASES };

function sameOperation(left: ComputerRebuildOperationId | null, right: ComputerRebuildOperationId | null): boolean {
  return left != null && right != null && left.value === right.value;
}

function sameEvent(left: BoxMigrationEvent | null, right: BoxMigrationEvent | null): boolean {
  return left != null && right != null && left.phase === right.phase && left.detail === right.detail && sameOperation(left.operationId, right.operationId)
    || left?.phase === right?.phase && left?.detail === right?.detail && left?.operationId === null && right?.operationId === null;
}

export function createComputerRebuildMigrationStore(input: {
  bridge: Pick<DesktopBridge, "getBoxMigrationStatus" | "onBoxMigration">;
  initialState: ComputerRebuildState;
  now: () => number;
}): ComputerRebuildMigrationStore {
  let state = input.initialState;
  let migration: BoxMigrationEvent | null = null;
  let migrationOperationId: ComputerRebuildOperationId | null = null;
  let migrationPhases: readonly BoxMigrationPhase[] = EMPTY_PHASES;
  let snapshot: BoxMigrationSnapshot = EMPTY_SNAPSHOT;
  let disposed = false;
  let connected = false;
  let hydrating = false;
  let generation = 0;
  let pending: Promise<void> | null = null;
  let stopBridge: Unsubscribe | null = null;
  const listeners = new Set<() => void>();

  const notify = () => { for (const listener of [...listeners]) listener(); };
  const ingest = (next: BoxMigrationEvent) => {
    if (disposed || sameEvent(migration, next)) return;
    const keepsAnonymousEpisode = migrationOperationId == null
      && next.operationId == null
      && migration != null
      && migration.phase !== "done"
      && migration.phase !== "failed";
    if (!keepsAnonymousEpisode && !sameOperation(migrationOperationId, next.operationId)) {
      migrationOperationId = next.operationId;
      migrationPhases = EMPTY_PHASES;
    }
    if (next.phase !== "done" && next.phase !== "failed" && migrationPhases.at(-1) !== next.phase) {
      migrationPhases = [...migrationPhases, next.phase];
    }
    generation += 1;
    hydrating = false;
    migration = next;
    snapshot = { operationId: migrationOperationId, phase: next.phase, detail: next.detail, migrationPhases };
    const event: ComputerRebuildEvent = { type: "migration", operationId: next.operationId, phase: next.phase, at: input.now() };
    state = reduceComputerRebuildState(state, event);
    notify();
  };
  const onBridgeEvent = (value: unknown) => {
    const event = parseBoxMigrationEvent(value);
    if (event != null) ingest(event);
  };
  const hydrate = (): Promise<void> => {
    if (disposed || !connected) return Promise.resolve();
    if (pending != null) return pending;
    const attempt = ++generation;
    hydrating = true;
    notify();
    const request = input.bridge.getBoxMigrationStatus().then((value) => {
      if (disposed || !connected || attempt !== generation) return;
      const event = parseBoxMigrationEvent(value);
      if (event == null) return;
      ingest(event);
    }, () => {}).finally(() => {
      if (pending === request) pending = null;
      if (!disposed && attempt === generation) {
        hydrating = false;
        notify();
      }
    });
    pending = request;
    return request;
  };

  return {
    get: () => state,
    getMigration: () => migration,
    getSnapshot: () => snapshot,
    isHydrating: () => hydrating,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    connect() {
      if (disposed) return Promise.resolve();
      if (!connected) {
        connected = true;
        stopBridge = input.bridge.onBoxMigration(onBridgeEvent);
      }
      return hydrate();
    },
    noteReconnect: hydrate,
    reset() {
      if (disposed) return;
      generation += 1;
      connected = false;
      hydrating = false;
      pending = null;
      stopBridge?.();
      stopBridge = null;
      migration = null;
      migrationOperationId = null;
      migrationPhases = EMPTY_PHASES;
      snapshot = EMPTY_SNAPSHOT;
      state = input.initialState;
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      connected = false;
      hydrating = false;
      pending = null;
      stopBridge?.();
      stopBridge = null;
      listeners.clear();
    }
  };
}
