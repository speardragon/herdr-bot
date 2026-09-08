// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2621114 (Iu cached 30-second clock used by QIe/async tasks; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2621114 (Windows carrier of the same cached renderer clock; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

export const ASYNC_TASKS_CLOCK_INTERVAL_MS = 30_000;

export interface AsyncTasksClockInput {
  now(): number;
  subscribe?(listener: () => void): () => void;
}

export interface AsyncTasksClock {
  now(): number;
  subscribe(listener: () => void): () => void;
}

export interface AsyncTasksClockScheduler {
  start(listener: () => void, intervalMs: number): { dispose(): void };
}

const browserScheduler: AsyncTasksClockScheduler = {
  start(listener, intervalMs) {
    const handle = setInterval(listener, intervalMs);
    return { dispose: () => clearInterval(handle) };
  }
};

/**
 * Keep the renderer's time snapshot stable between scheduled notifications.
 * The optional source subscription is used by injected clocks; when absent,
 * the first-party 30-second polling cadence matches the shipped Iu store.
 */
export function createStableAsyncTasksClock(
  input: AsyncTasksClockInput,
  scheduler: AsyncTasksClockScheduler = browserScheduler
): AsyncTasksClock {
  let valueMs = input.now();
  const listeners = new Set<() => void>();
  let polling: { dispose(): void } | null = null;
  let sourceRelease: (() => void) | null = null;

  const publish = (): void => {
    valueMs = input.now();
    for (const listener of [...listeners]) listener();
  };
  const stop = (): void => {
    polling?.dispose();
    polling = null;
    sourceRelease?.();
    sourceRelease = null;
  };

  return {
    now: () => valueMs,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        if (input.subscribe != null) sourceRelease = input.subscribe(publish);
        else polling = scheduler.start(publish, ASYNC_TASKS_CLOCK_INTERVAL_MS);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    }
  };
}

/** The mounted panel's default clock is a shared, cached snapshot owner. */
export const DEFAULT_ASYNC_TASKS_CLOCK: AsyncTasksClock = createStableAsyncTasksClock({ now: () => Date.now() });
