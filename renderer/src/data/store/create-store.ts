/**
 * A minimal observable value container -- just enough to back `useSyncExternalStore` without pulling
 * in a state-management library (see the foundation brief: "a small store (React context +
 * useSyncExternalStore, no heavy libs)"). Pure/DOM-free so it is unit-testable with plain `node --test`.
 */

export interface Store<T> {
  getState(): T;
  /** Replaces the whole state and notifies subscribers, but only if `next !== current state`
   * (reference equality) -- reducers must return the same reference when nothing changed so
   * `useSyncExternalStore` callers don't re-render for no reason. */
  setState(next: T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (next) => {
      if (next === state) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
