import {
  reduceComputerRebuildState,
  type ComputerRebuildEvent,
  type ComputerRebuildState
} from "./computer-rebuild-model";
import type { ProductionCoordinatorClient } from "../../../../production/coordinator-client";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4864159
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5603486
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export interface ForeverBoxStatus extends Record<string, unknown> {
  readonly agentId: string;
  readonly state: string;
}

export interface ComputerRebuildBoxSource {
  getForeverBoxStatus(boxId: string): Promise<unknown>;
  subscribeForeverBox(listener: (value: unknown) => void): () => void;
}

export function createComputerRebuildBoxSource(client: Pick<ProductionCoordinatorClient, "call" | "subscribe">): ComputerRebuildBoxSource {
  return {
    getForeverBoxStatus: (boxId) => client.call("getForeverBoxStatus", { id: boxId }),
    subscribeForeverBox: (listener) => client.subscribe("forever-box", listener)
  };
}

export interface ComputerRebuildBoxStore {
  get(): ComputerRebuildState;
  getStatus(): ForeverBoxStatus | null;
  isHydrating(): boolean;
  subscribe(listener: () => void): () => void;
  connect(): Promise<void>;
  noteReconnect(): Promise<void>;
  reset(): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseForeverBoxStatus(value: unknown): ForeverBoxStatus | null {
  if (!isRecord(value) || typeof value.agentId !== "string" || value.agentId.length === 0 || typeof value.state !== "string") return null;
  return value as ForeverBoxStatus;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4864159
export function projectForeverBoxPhase(value: ForeverBoxStatus, isStarting = false): string {
  if (value.pull != null) return "pulling";
  if (value.state === "running") return typeof value.vncUrl === "string" && value.vncUrl.length > 0 ? "running" : "local";
  if (isStarting) return "starting";
  if (value.state === "hibernated") return "sleeping";
  return "off";
}

function sameStatus(left: ForeverBoxStatus | null, right: ForeverBoxStatus | null): boolean {
  return left != null && right != null && left.agentId === right.agentId && left.state === right.state
    && left.pull === right.pull && left.vncUrl === right.vncUrl && left.imageUpdateAvailable === right.imageUpdateAvailable;
}

export function createComputerRebuildBoxStore(input: {
  boxId: string;
  source: ComputerRebuildBoxSource;
  initialState: ComputerRebuildState;
  now: () => number;
}): ComputerRebuildBoxStore {
  let state = input.initialState;
  let status: ForeverBoxStatus | null = null;
  let disposed = false;
  let connected = false;
  let hydrating = false;
  let generation = 0;
  let pending: Promise<void> | null = null;
  let stopSource: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const notify = () => { for (const listener of [...listeners]) listener(); };
  const ingest = (next: ForeverBoxStatus) => {
    if (disposed || next.agentId !== input.boxId || sameStatus(status, next)) return;
    generation += 1;
    hydrating = false;
    status = next;
    const at = input.now();
    const imageUpdateAvailable = typeof next.imageUpdateAvailable === "boolean" ? next.imageUpdateAvailable : undefined;
    if (imageUpdateAvailable !== undefined) {
      const imageEvent: ComputerRebuildEvent = { type: "image-update", available: imageUpdateAvailable, at };
      state = reduceComputerRebuildState(state, imageEvent);
    }
    const boxEvent: ComputerRebuildEvent = { type: "box", boxId: next.agentId, phase: projectForeverBoxPhase(next), at };
    state = reduceComputerRebuildState(state, boxEvent);
    notify();
  };
  const onSourceEvent = (value: unknown) => {
    const next = parseForeverBoxStatus(value);
    if (next != null) ingest(next);
  };
  const hydrate = (): Promise<void> => {
    if (disposed || !connected) return Promise.resolve();
    if (pending != null) return pending;
    const attempt = ++generation;
    hydrating = true;
    notify();
    const request = input.source.getForeverBoxStatus(input.boxId).then((value) => {
      if (disposed || !connected || attempt !== generation) return;
      const next = parseForeverBoxStatus(value);
      if (next != null) ingest(next);
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
    getStatus: () => status,
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
        stopSource = input.source.subscribeForeverBox(onSourceEvent);
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
      stopSource?.();
      stopSource = null;
      status = null;
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
      stopSource?.();
      stopSource = null;
      listeners.clear();
    }
  };
}
