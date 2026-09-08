import type { ProductionCoordinatorClient } from "../../../../production/coordinator-client";
import {
  reduceComputerRebuildState,
  type ComputerRebuildEvent,
  type ComputerRebuildState
} from "./computer-rebuild-model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5603486
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export type ComputerRebuildTransportState = "connected" | "down";

export interface ComputerRebuildTransportSource {
  readonly ready: Promise<void>;
  subscribeTransport(listener: (state: unknown) => void): () => void;
}

export function createComputerRebuildTransportSource(client: Pick<ProductionCoordinatorClient, "ready" | "subscribeTransport">): ComputerRebuildTransportSource {
  return {
    ready: client.ready,
    subscribeTransport: (listener) => client.subscribeTransport(listener)
  };
}

export interface ComputerRebuildTransportStore {
  get(): ComputerRebuildState;
  getTransportState(): ComputerRebuildTransportState;
  isHydrating(): boolean;
  subscribe(listener: () => void): () => void;
  connect(): Promise<void>;
  reset(): void;
  dispose(): void;
}

function parseTransportState(value: unknown): ComputerRebuildTransportState | null {
  return value === "connected" || value === "down" ? value : null;
}

export function createComputerRebuildTransportStore(input: {
  source: ComputerRebuildTransportSource;
  initialState: ComputerRebuildState;
  now: () => number;
}): ComputerRebuildTransportStore {
  let state = input.initialState;
  let transportState: ComputerRebuildTransportState = state.isConnected ? "connected" : "down";
  let disposed = false;
  let connected = false;
  let hydrating = false;
  let generation = 0;
  let pending: Promise<void> | null = null;
  let stopSource: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const notify = () => { for (const listener of [...listeners]) listener(); };
  const ingest = (next: ComputerRebuildTransportState) => {
    if (disposed) return;
    generation += 1;
    hydrating = false;
    if (next === transportState) {
      notify();
      return;
    }
    transportState = next;
    const event: ComputerRebuildEvent = { type: "connection", isConnected: next === "connected", at: input.now() };
    state = reduceComputerRebuildState(state, event);
    notify();
  };
  const onSourceEvent = (value: unknown) => {
    const next = parseTransportState(value);
    if (next != null) ingest(next);
  };
  const hydrate = (): Promise<void> => {
    if (disposed || !connected) return Promise.resolve();
    if (pending != null) return pending;
    const attempt = ++generation;
    hydrating = true;
    notify();
    const request = input.source.ready.then(() => {
      if (disposed || !connected || attempt !== generation) return;
      ingest("connected");
    }, () => {
      if (disposed || !connected || attempt !== generation) return;
      ingest("down");
    }).finally(() => {
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
    getTransportState: () => transportState,
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
        stopSource = input.source.subscribeTransport(onSourceEvent);
      }
      return hydrate();
    },
    reset() {
      if (disposed) return;
      generation += 1;
      connected = false;
      hydrating = false;
      pending = null;
      stopSource?.();
      stopSource = null;
      transportState = input.initialState.isConnected ? "connected" : "down";
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
