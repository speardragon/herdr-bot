import type { DesktopBridge, Unsubscribe } from "../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5610448
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5736150
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export interface DevBoxRebuildSnapshot {
  readonly generation: number;
  readonly isPending: boolean;
}

export interface DevBoxRebuildSignalStore {
  get(): DevBoxRebuildSnapshot;
  subscribe(listener: () => void): Unsubscribe;
  acknowledge(generation: number): void;
  dispose(): void;
}

const EMPTY_SNAPSHOT: DevBoxRebuildSnapshot = { generation: 0, isPending: false };

export function createDevBoxRebuildSignalStore(
  bridge: Pick<DesktopBridge, "onDevBoxRebuild">
): DevBoxRebuildSignalStore {
  let snapshot = EMPTY_SNAPSHOT;
  let disposed = false;
  const listeners = new Set<() => void>();
  let stopBridge: Unsubscribe | null = null;

  const publish = (next: DevBoxRebuildSnapshot) => {
    if (disposed || (next.generation === snapshot.generation && next.isPending === snapshot.isPending)) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const onRebuild = () => {
    publish({ generation: snapshot.generation + 1, isPending: true });
  };

  stopBridge = bridge.onDevBoxRebuild(onRebuild);
  return {
    get: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    acknowledge(generation) {
      if (disposed || !snapshot.isPending || generation !== snapshot.generation) return;
      publish({ generation, isPending: false });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopBridge?.();
      stopBridge = null;
      listeners.clear();
    }
  };
}
