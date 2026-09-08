// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L20094-L20098
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L20188-L20204
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L136391-L136472

import { SourceFailure } from "../../../runtime/source-boundary";

export { SourceFailure } from "../../../runtime/source-boundary";

export const SAND_TEACH_MAX_DURATION_MS = 600 * 1_000;
export const TEACH_RECORDING_TIMER_NAME = "teach-recording-timer";
export const TEACH_RECORDING_TICK_MS = 1_000;

export interface TeachRecordingIdleStatus extends Record<string, unknown> {
  state: "idle";
  agentId: null;
  startedAtMs: null;
  maxDurationMs: number;
}

export interface TeachRecordingActiveStatus extends Record<string, unknown> {
  state: "recording";
  agentId: string;
  startedAtMs: number;
  maxDurationMs: number;
}

export type TeachRecordingStatus = TeachRecordingIdleStatus | TeachRecordingActiveStatus;

export const IDLE_TEACH_RECORDING_STATUS: TeachRecordingIdleStatus = {
  state: "idle",
  agentId: null,
  startedAtMs: null,
  maxDurationMs: SAND_TEACH_MAX_DURATION_MS
};

export interface TeachRecordingArm extends Record<string, unknown> {
  agentId: string;
  entryPoint: string;
}

export interface TeachRecordingSnapshotStore<Value> {
  get(): Value;
  subscribe(listener: () => void): () => void;
}

interface MutableTeachRecordingSnapshotStore<Value> extends TeachRecordingSnapshotStore<Value> {
  set(value: Value): void;
  update(project: (value: Value) => Value): void;
}

export interface TeachRecordingSource {
  getTeachRecordingStatus(): Promise<TeachRecordingStatus>;
  startTeachRecording(input: { agentId: string; entryPoint: string | undefined }): Promise<TeachRecordingStatus>;
  stopTeachRecording(input: { agentId: string; save: boolean }): Promise<TeachRecordingStatus>;
}

export interface TeachRecordingClock {
  now(): number;
}

export interface TeachRecordingPollingHandle {
  dispose(): void;
}

export interface TeachRecordingPollingPolicy {
  start(callback: () => Promise<void>): TeachRecordingPollingHandle;
}

export interface TeachRecordingPollingPolicyFactory {
  (input: { name: string; intervalMs: number }): TeachRecordingPollingPolicy;
}

export interface TeachRecordingStore {
  readonly snapshots: TeachRecordingSnapshotStore<TeachRecordingStatus>;
  readonly armed: TeachRecordingSnapshotStore<TeachRecordingArm | null>;
  readonly nowMs: TeachRecordingSnapshotStore<number>;
  arm(value: TeachRecordingArm | null): void;
  start(agentId: string, entryPoint?: string): Promise<void>;
  stop(agentId: string, save: boolean): Promise<void>;
  ingest(status: TeachRecordingStatus): void;
  connect(): void;
  noteReconnect(): void;
  reset(): void;
  dispose(): void;
}

function createSnapshotStore<Value>(initial: Value): MutableTeachRecordingSnapshotStore<Value> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next) => {
      if (!Object.is(next, value)) {
        value = next;
        for (const listener of [...listeners]) listener();
      }
    },
    update: (project) => {
      const next = project(value);
      if (!Object.is(next, value)) {
        value = next;
        for (const listener of [...listeners]) listener();
      }
    }
  };
}

export function createTeachRecordingStore(input: {
  source: TeachRecordingSource;
  clock: TeachRecordingClock;
  pollingPolicy: TeachRecordingPollingPolicyFactory;
}): TeachRecordingStore {
  const snapshots = createSnapshotStore<TeachRecordingStatus>(IDLE_TEACH_RECORDING_STATUS);
  const armed = createSnapshotStore<TeachRecordingArm | null>(null);
  const nowMs = createSnapshotStore(input.clock.now());
  const polling = input.pollingPolicy({
    name: TEACH_RECORDING_TIMER_NAME,
    intervalMs: TEACH_RECORDING_TICK_MS
  });
  let timer: TeachRecordingPollingHandle | null = null;
  let startOperation: { agentId: string; promise: Promise<void> } | null = null;
  let stopOperation: { agentId: string; promise: Promise<void> } | null = null;
  let cleanup: Promise<void> | null = null;
  let version = 0;
  let generation = 0;
  let disposed = false;

  const updateClock = (state: TeachRecordingStatus["state"]) => {
    if (state === "recording" && timer == null) {
      nowMs.set(input.clock.now());
      timer = polling.start(async () => {
        nowMs.set(input.clock.now());
      });
    } else if (state !== "recording" && timer != null) {
      timer.dispose();
      timer = null;
    }
  };

  const publish = (status: TeachRecordingStatus) => {
    if (!disposed) {
      version += 1;
      snapshots.set(status);
      updateClock(status.state);
    }
  };

  const heal = async (): Promise<boolean> => {
    if (disposed) return false;
    const expectedGeneration = generation;
    version += 1;
    const expectedVersion = version;
    try {
      const status = await input.source.getTeachRecordingStatus();
      if (
        disposed ||
        expectedGeneration !== generation ||
        expectedVersion !== version ||
        (stopOperation != null && status.state === "recording")
      ) return false;
      snapshots.set(status);
      updateClock(status.state);
      return true;
    } catch (error) {
      if (!(error instanceof SourceFailure)) throw error;
      return false;
    }
  };

  const discard = (agentId: string): Promise<void> => input.source.stopTeachRecording({
    agentId,
    save: false
  }).then(() => undefined, () => undefined);

  const queueCleanup = (operation: () => Promise<void>) => {
    const next = (cleanup ?? Promise.resolve()).then(operation, operation);
    cleanup = next;
    void next.then(() => {
      if (cleanup === next) cleanup = null;
    });
  };

  return {
    snapshots,
    armed,
    nowMs,
    arm: (value) => {
      if (!disposed) armed.set(value);
    },
    start: async (agentId, entryPoint) => {
      const capturedStop = stopOperation;
      const capturedCleanup = cleanup;
      const expectedGeneration = generation;
      const operation = {
        agentId,
        promise: (async () => {
          if (capturedStop != null) await capturedStop.promise;
          if (capturedCleanup != null) await capturedCleanup;
          if (disposed || expectedGeneration !== generation) return;
          const previousStatus = snapshots.get();
          publish({
            state: "recording",
            agentId,
            startedAtMs: input.clock.now(),
            maxDurationMs: IDLE_TEACH_RECORDING_STATUS.maxDurationMs
          });
          const optimisticVersion = version;
          try {
            const status = await input.source.startTeachRecording({ agentId, entryPoint });
            if (disposed || expectedGeneration !== generation) return;
            if (version === optimisticVersion) publish(status);
          } catch (error) {
            if (!(error instanceof SourceFailure)) throw error;
            if (disposed || expectedGeneration !== generation || version !== optimisticVersion) return;
            const healingVersion = version + 1;
            if (!await heal() && version === healingVersion) publish(previousStatus);
          }
        })()
      };
      startOperation = operation;
      try {
        await operation.promise;
      } finally {
        if (startOperation === operation) startOperation = null;
      }
    },
    stop: async (agentId, save) => {
      const capturedStart = startOperation;
      const capturedCleanup = cleanup;
      const expectedGeneration = generation;
      const previousStatus = snapshots.get();
      publish(IDLE_TEACH_RECORDING_STATUS);
      const operation = {
        agentId,
        promise: (async () => {
          if (capturedStart != null) await capturedStart.promise;
          if (capturedCleanup != null) await capturedCleanup;
          if (disposed || expectedGeneration !== generation) return;
          try {
            const status = await input.source.stopTeachRecording({ agentId, save });
            if (disposed || expectedGeneration !== generation) return;
            publish(status);
          } catch (error) {
            if (!(error instanceof SourceFailure)) throw error;
            if (disposed || expectedGeneration !== generation) return;
            const healingVersion = version + 1;
            if (!await heal() && version === healingVersion) publish(previousStatus);
          }
        })()
      };
      stopOperation = operation;
      try {
        await operation.promise;
      } finally {
        if (stopOperation === operation) stopOperation = null;
      }
    },
    ingest: (status) => {
      if (stopOperation == null || status.state !== "recording") publish(status);
    },
    connect: () => {
      void heal();
    },
    noteReconnect: () => {
      void heal();
    },
    reset: () => {
      if (disposed) return;
      const status = snapshots.get();
      const agentId = status.agentId;
      const capturedStart = startOperation;
      const capturedStop = stopOperation;
      generation += 1;
      version += 1;
      snapshots.set(IDLE_TEACH_RECORDING_STATUS);
      armed.set(null);
      updateClock("idle");
      if (status.state === "recording" && agentId != null) queueCleanup(() => discard(agentId));
      if (capturedStop != null) queueCleanup(() => discard(capturedStop.agentId));
      if (capturedStart != null) {
        queueCleanup(() => capturedStart.promise.then(
          () => discard(capturedStart.agentId),
          () => discard(capturedStart.agentId)
        ));
      }
    },
    dispose: () => {
      disposed = true;
      generation += 1;
      version += 1;
      if (timer != null) {
        timer.dispose();
        timer = null;
      }
    }
  };
}
