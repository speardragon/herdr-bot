// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=805625 (first-party Dn snapshot store)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=1067226 (expanded Mac/Windows carrier of the same store)

/**
 * The renderer's first-party mutable snapshot owner. It is intentionally
 * React-independent: consumers provide get/subscribe to useSyncExternalStore
 * or to another lifecycle owner.
 */
export interface SnapshotStore<Value> {
  get(): Value;
  subscribe(listener: () => void): () => void;
  set(value: Value): void;
  update(updater: (current: Value) => Value): void;
}

export function createSnapshotStore<Value>(initial: Value): SnapshotStore<Value> {
  let current = initial;
  const listeners = new Set<() => void>();
  const publish = (next: Value): void => {
    if (Object.is(next, current)) return;
    current = next;
    for (const listener of [...listeners]) listener();
  };

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: publish,
    update(updater) {
      publish(updater(current));
    }
  };
}
