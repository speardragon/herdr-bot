import { useMemo, useState, useSyncExternalStore } from "react";
import { COMPUTER_ACTIVE_HOLD_MS, VNC_STATUS_TIMEOUT_MS, type ComputerReadState } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L119598-L119876

export const COMPUTER_STATUS_RECORD_LIMIT = 32;
export const COMPUTER_STATUS_FETCH_DEADLINE_NAME = "forever-box-status-fetch";
export const COMPUTER_STATUS_FETCH_TIMEOUT_MS = VNC_STATUS_TIMEOUT_MS;

export interface ComputerBoxStatus extends Record<string, unknown> {
  agentId: string;
}

export interface ComputerStatusSnapshot {
  status: ComputerBoxStatus | null;
  readState: ComputerReadState;
  isEnsureStarting: boolean;
}

export interface ComputerSnapshotStore<Value> {
  get(): Value;
  subscribe(listener: () => void): () => void;
}

interface MutableComputerSnapshotStore<Value> extends ComputerSnapshotStore<Value> {
  set(value: Value): void;
}

export interface ComputerStatusSource {
  getForeverBoxStatus(input: { id: string }): Promise<ComputerBoxStatus | null>;
  ensureForeverBox(input: { id: string }): Promise<ComputerBoxStatus | null>;
  handBackForeverBox(input: { id: string; trigger: string }): Promise<unknown>;
}

export interface ComputerStatusDeadline {
  run<Value>(work: () => Promise<Value>): Promise<Value>;
}

export class ComputerStatusDeadlineExceededError extends Error {}

export interface ComputerStatusStore {
  readonly versionSnapshots: ComputerSnapshotStore<number>;
  readonly diskPressureSnapshots: ComputerSnapshotStore<unknown>;
  readonly vncUserPresenceSnapshots: ComputerSnapshotStore<boolean>;
  statusSnapshotsFor(boxId: string): ComputerSnapshotStore<ComputerStatusSnapshot>;
  retain(boxId: string): () => void;
  getStatus(boxId: string | null): ComputerBoxStatus | null;
  getReadState(boxId: string | null): ComputerReadState;
  getMostRecentStatus(): ComputerBoxStatus | null;
  refresh(boxId: string): Promise<void>;
  hasDemanded(boxId: string | null): boolean;
  ensure(boxId: string): Promise<void>;
  handBack(boxId: string, trigger?: string): Promise<unknown>;
  recordReadFailure(boxId: string): void;
  subscribeComputerActions(listener: (value: unknown) => void): () => void;
  ingestForeverBox(status: ComputerBoxStatus): void;
  ingestBoxDiskPressure(value: unknown): void;
  ingestComputerAction(value: unknown): void;
  ingestVncUserPresence(value: { isPresent: boolean }): void;
  connect(): void;
  noteReconnect(): void;
  noteWindowFocus(): void;
  reset(): void;
  dispose(): void;
}

interface ComputerStatusRecord {
  readonly boxId: string;
  status: ComputerBoxStatus | null;
  settledReadState: ComputerReadState | null;
  readAttempt: number;
  pendingRead: Promise<void> | null;
  pendingEnsure: Promise<void> | null;
  isEnsureStarting: boolean;
  watchers: number;
  snapshots: MutableComputerSnapshotStore<ComputerStatusSnapshot> | null;
  publicSnapshots: ComputerSnapshotStore<ComputerStatusSnapshot> | null;
}

function createSnapshotStore<Value>(initial: Value): MutableComputerSnapshotStore<Value> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    }
  };
}

export function createComputerStatusDeadline(timeoutMs = VNC_STATUS_TIMEOUT_MS): ComputerStatusDeadline {
  return {
    run<Value>(work: () => Promise<Value>): Promise<Value> {
      const request = work();
      return new Promise<Value>((resolve, reject) => {
        const timeout = globalThis.setTimeout(() => reject(new ComputerStatusDeadlineExceededError()), timeoutMs);
        void request.then(
          (value) => { globalThis.clearTimeout(timeout); resolve(value); },
          (error) => { globalThis.clearTimeout(timeout); reject(error); }
        );
      });
    }
  };
}

export function createComputerStatusStore(input: {
  source: ComputerStatusSource;
  statusFetchDeadline?: ComputerStatusDeadline;
}): ComputerStatusStore {
  const { source } = input;
  const statusFetchDeadline = input.statusFetchDeadline ?? createComputerStatusDeadline();
  const records = new Map<string, ComputerStatusRecord>();
  const demanded = new Set<string>();
  const versionSnapshots = createSnapshotStore(0);
  const diskPressureSnapshots = createSnapshotStore<unknown>(null);
  const vncUserPresenceSnapshots = createSnapshotStore(false);
  const computerActionListeners = new Set<(value: unknown) => void>();
  let connected = false;
  let disposed = false;
  let ensureGeneration = 0;

  const evictRecords = () => {
    if (records.size <= COMPUTER_STATUS_RECORD_LIMIT) return;
    for (const record of records.values()) {
      if (record.watchers > 0 || record.pendingRead != null || record.pendingEnsure != null) continue;
      records.delete(record.boxId);
      if (records.size <= COMPUTER_STATUS_RECORD_LIMIT) return;
    }
  };

  const recordFor = (boxId: string): ComputerStatusRecord => {
    const existing = records.get(boxId);
    if (existing != null) return existing;
    const record: ComputerStatusRecord = {
      boxId,
      status: null,
      settledReadState: null,
      readAttempt: 0,
      pendingRead: null,
      pendingEnsure: null,
      isEnsureStarting: false,
      watchers: 0,
      snapshots: null,
      publicSnapshots: null
    };
    records.set(boxId, record);
    evictRecords();
    return record;
  };

  const readStateFor = (record: ComputerStatusRecord): ComputerReadState =>
    record.status != null ? "known" : record.settledReadState ?? "unknown";

  const publish = (record: ComputerStatusRecord) => {
    record.snapshots?.set({
      status: record.status,
      readState: readStateFor(record),
      isEnsureStarting: record.isEnsureStarting
    });
    versionSnapshots.set(versionSnapshots.get() + 1);
  };

  const cacheStatus = (status: ComputerBoxStatus) => {
    const record = recordFor(status.agentId);
    record.status = status;
    diskPressureSnapshots.set(status.diskPressure ?? null);
    record.settledReadState = null;
    records.delete(record.boxId);
    records.set(record.boxId, record);
    publish(record);
  };

  const settleRead = (record: ComputerStatusRecord, attempt: number, state: ComputerReadState) => {
    if (record.readAttempt !== attempt || record.status != null || record.settledReadState === state) return;
    record.settledReadState = state;
    publish(record);
  };

  const recordFailure = (record: ComputerStatusRecord) => {
    if (record.status != null || record.settledReadState === "error") return;
    record.settledReadState = "error";
    publish(record);
  };

  const refreshRecord = (record: ComputerStatusRecord): Promise<void> => {
    if (disposed || !connected) return Promise.resolve();
    if (record.pendingRead != null) return record.pendingRead;
    const attempt = ++record.readAttempt;
    if (record.status == null && record.settledReadState === "error") {
      record.settledReadState = null;
      publish(record);
    }
    const sourceRequest = source.getForeverBoxStatus({ id: record.boxId });
    const pending = statusFetchDeadline.run(() => sourceRequest).then(
      (status) => ({ kind: "resolved" as const, status }),
      (error) => error instanceof ComputerStatusDeadlineExceededError
        ? ({ kind: "timed-out" as const })
        : ({ kind: "failed" as const })
    ).then((result) => {
      if (record.pendingRead === pending) record.pendingRead = null;
      if (disposed) return;
      if (result.kind === "resolved") {
        if (record.readAttempt === attempt && result.status != null) {
          cacheStatus(result.status);
          return;
        }
        settleRead(record, attempt, "known");
        return;
      }
      settleRead(record, attempt, "error");
      if (result.kind === "timed-out") {
        void sourceRequest.then(
          (status) => {
            if (!disposed && record.readAttempt === attempt && status != null) cacheStatus(status);
          },
          () => settleRead(record, attempt, "error")
        );
      }
    });
    record.pendingRead = pending;
    return pending;
  };

  const ensureRecord = (record: ComputerStatusRecord): Promise<void> => {
    if (disposed) return Promise.resolve();
    demanded.add(record.boxId);
    if (record.pendingEnsure != null) return record.pendingEnsure;
    const generation = ensureGeneration;
    record.isEnsureStarting = true;
    publish(record);
    const sourceRequest = source.ensureForeverBox({ id: record.boxId });
    const pending = statusFetchDeadline.run(() => sourceRequest).then(
      (status) => ({ kind: "resolved" as const, status }),
      (error) => error instanceof ComputerStatusDeadlineExceededError
        ? ({ kind: "timed-out" as const })
        : ({ kind: "failed" as const })
    ).then((result) => {
      if (record.pendingEnsure === pending) {
        record.pendingEnsure = null;
        record.isEnsureStarting = false;
        if (!disposed) publish(record);
      }
      if (disposed || generation !== ensureGeneration) return;
      if (result.kind === "resolved") {
        if (result.status != null) cacheStatus(result.status);
        return;
      }
      recordFailure(record);
      if (result.kind === "timed-out") {
        void sourceRequest.then(
          (status) => {
            if (!disposed && generation === ensureGeneration && status != null) cacheStatus(status);
          },
          () => {}
        );
      }
    });
    record.pendingEnsure = pending;
    return pending;
  };

  const retainRecord = (record: ComputerStatusRecord) => {
    record.watchers += 1;
    if (connected) void refreshRecord(record);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      record.watchers -= 1;
      evictRecords();
    };
  };

  const snapshotsFor = (record: ComputerStatusRecord): ComputerSnapshotStore<ComputerStatusSnapshot> => {
    record.snapshots ??= createSnapshotStore({
      status: record.status,
      readState: readStateFor(record),
      isEnsureStarting: record.isEnsureStarting
    });
    const snapshots = record.snapshots;
    record.publicSnapshots ??= {
      get: snapshots.get,
      subscribe(listener) {
        const release = retainRecord(record);
        const unsubscribe = snapshots.subscribe(listener);
        return () => { unsubscribe(); release(); };
      }
    };
    return record.publicSnapshots;
  };

  return {
    versionSnapshots,
    diskPressureSnapshots,
    vncUserPresenceSnapshots,
    statusSnapshotsFor: (boxId) => snapshotsFor(recordFor(boxId)),
    retain: (boxId) => retainRecord(recordFor(boxId)),
    getStatus: (boxId) => boxId == null ? null : records.get(boxId)?.status ?? null,
    getReadState: (boxId) => {
      if (boxId == null) return "unknown";
      const record = records.get(boxId);
      return record == null ? "unknown" : readStateFor(record);
    },
    getMostRecentStatus: () => {
      let mostRecent: ComputerBoxStatus | null = null;
      for (const record of records.values()) if (record.status != null) mostRecent = record.status;
      return mostRecent;
    },
    refresh: (boxId) => refreshRecord(recordFor(boxId)),
    hasDemanded: (boxId) => boxId != null && demanded.has(boxId),
    ensure: (boxId) => ensureRecord(recordFor(boxId)),
    handBack: (boxId, trigger = "button") => source.handBackForeverBox({ id: boxId, trigger }),
    recordReadFailure: (boxId) => { if (!disposed) recordFailure(recordFor(boxId)); },
    subscribeComputerActions(listener) {
      if (disposed) return () => {};
      computerActionListeners.add(listener);
      return () => computerActionListeners.delete(listener);
    },
    ingestForeverBox(status) {
      if (disposed) return;
      const record = recordFor(status.agentId);
      record.readAttempt += 1;
      record.pendingRead = null;
      cacheStatus(status);
    },
    ingestBoxDiskPressure(value) { if (!disposed) diskPressureSnapshots.set(value); },
    ingestComputerAction(value) {
      if (!disposed) for (const listener of [...computerActionListeners]) listener(value);
    },
    ingestVncUserPresence(value) { if (!disposed) vncUserPresenceSnapshots.set(value.isPresent); },
    connect() {
      if (connected || disposed) return;
      connected = true;
      for (const record of records.values()) if (record.watchers > 0) void refreshRecord(record);
    },
    noteReconnect() {
      if (!connected || disposed) return;
      for (const record of records.values()) {
        if (record.watchers === 0) continue;
        record.readAttempt += 1;
        record.pendingRead = null;
        void refreshRecord(record);
        if (demanded.has(record.boxId)) void ensureRecord(record);
      }
    },
    noteWindowFocus() {
      if (!connected || disposed) return;
      for (const record of records.values()) {
        if (record.watchers === 0) continue;
        void refreshRecord(record);
        if (demanded.has(record.boxId)) void ensureRecord(record);
      }
    },
    reset() {
      connected = false;
      ensureGeneration += 1;
      for (const record of records.values()) {
        record.readAttempt += 1;
        record.pendingRead = null;
        record.pendingEnsure = null;
        record.status = null;
        record.settledReadState = null;
        record.isEnsureStarting = false;
        if (record.watchers === 0) {
          records.delete(record.boxId);
          continue;
        }
        publish(record);
      }
      demanded.clear();
      vncUserPresenceSnapshots.set(false);
      diskPressureSnapshots.set(null);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      connected = false;
      ensureGeneration += 1;
      for (const record of records.values()) {
        record.readAttempt += 1;
        record.pendingRead = null;
        record.pendingEnsure = null;
      }
      computerActionListeners.clear();
    }
  };
}

export interface ComputerActiveHoldDelay {
  wrap(callback: () => void): (() => void) & { dispose(): void };
}

export function createComputerActiveHoldDelay(delayMs = COMPUTER_ACTIVE_HOLD_MS): ComputerActiveHoldDelay {
  return {
    wrap(callback) {
      let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;
      const schedule = Object.assign(
        () => { timeout = globalThis.setTimeout(callback, delayMs); },
        { dispose: () => { if (timeout != null) globalThis.clearTimeout(timeout); timeout = null; } }
      );
      return schedule;
    }
  };
}

export function createComputerActiveHoldStore(
  delay: ComputerActiveHoldDelay,
  initial: { isActive: boolean; subjectId: string | null }
) {
  let isActive = initial.isActive;
  let subjectId = initial.subjectId;
  return {
    subscribeFor(next: { isActive: boolean; subjectId: string | null }) {
      return (listener: () => void) => {
        if (next.subjectId !== subjectId) {
          subjectId = next.subjectId;
          if (isActive !== next.isActive) { isActive = next.isActive; listener(); }
          return () => {};
        }
        if (next.isActive) {
          if (!isActive) { isActive = true; listener(); }
          return () => {};
        }
        if (!isActive) return () => {};
        const hold = delay.wrap(() => { isActive = false; listener(); });
        hold();
        return () => hold.dispose();
      };
    },
    read: () => isActive
  };
}

export function useComputerActiveHold(isActive: boolean, subjectId: string | null): boolean {
  const [store] = useState(() => createComputerActiveHoldStore(
    createComputerActiveHoldDelay(),
    { isActive, subjectId }
  ));
  const subscribe = useMemo(() => store.subscribeFor({ isActive, subjectId }), [isActive, store, subjectId]);
  return useSyncExternalStore(subscribe, store.read, store.read);
}

export const EMPTY_COMPUTER_STATUS_SNAPSHOT: ComputerStatusSnapshot = {
  status: null,
  readState: "unknown",
  isEnsureStarting: false
};

export function readComputerStatusSnapshot(
  snapshots: ComputerSnapshotStore<ComputerStatusSnapshot> | null
): ComputerStatusSnapshot {
  return snapshots?.get() ?? EMPTY_COMPUTER_STATUS_SNAPSHOT;
}

export const EMPTY_COMPUTER_STATUS_SUBSCRIBE = () => () => {};
