import type { ProductionCoordinatorClient } from "../../../../production/coordinator-client";
import type { ComputerStatusStore } from "../../computer/shell/status-store";
import { ONBOARDING_BOX_PROBE_MS, ONBOARDING_BOX_WAIT_TIMEOUT_MS } from "./model";

// Immutable anchors: renderer JS bytes 5,441,790-5,442,850 and 5,624,537.
// The hand-off owner is cancellable at renderer bytes 5,435,131-5,435,982.
// The shipped probe is exactly source.countAgents(); its returned count is ignored.

export interface OnboardingComputerSnapshot {
  isComputerReady: boolean;
  computerState: string | null;
  pullPercent: number | null;
}

export interface OnboardingComputerStatusSource {
  getSnapshot(): Pick<OnboardingComputerSnapshot, "computerState" | "pullPercent">;
  subscribe(listener: () => void): () => void;
}

export interface OnboardingComputerReadiness {
  getSnapshot(): OnboardingComputerSnapshot;
  subscribe(listener: () => void): () => void;
  waitForComputer(): Promise<void>;
  dispose(): void;
}

export interface OnboardingReadinessClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const SYSTEM_CLOCK: OnboardingReadinessClock = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const CLOSED_STATUS: OnboardingComputerStatusSource = {
  getSnapshot: () => ({ computerState: null, pullPercent: null }),
  subscribe: () => () => {},
};

/**
 * The shipped renderer reads onboarding status from the shared forever-box
 * store, rather than from the coordinator probe used for readiness. Keep that
 * boundary typed so onboarding cannot accidentally subscribe to a second box
 * lifecycle or invent a fallback status.
 */
export function createOnboardingComputerStatusSource(
  store: Pick<ComputerStatusStore, "versionSnapshots" | "getMostRecentStatus"> | null | undefined,
): OnboardingComputerStatusSource {
  if (store == null) return CLOSED_STATUS;
  return {
    getSnapshot() {
      const status = store.getMostRecentStatus();
      const pull = status?.pull;
      const pullRecord = typeof pull === "object" && pull !== null ? pull as Record<string, unknown> : null;
      return {
        computerState: typeof status?.state === "string" ? status.state : null,
        pullPercent: typeof pullRecord?.percent === "number" ? pullRecord.percent : null,
      };
    },
    subscribe(listener) {
      return store.versionSnapshots.subscribe(listener);
    },
  };
}

export function createOnboardingComputerReadiness(
  probe: () => Promise<unknown>,
  options: { clock?: OnboardingReadinessClock; status?: OnboardingComputerStatusSource } = {},
): OnboardingComputerReadiness {
  const clock = options.clock ?? SYSTEM_CLOCK;
  const status = options.status ?? CLOSED_STATUS;
  const listeners = new Set<() => void>();
  const waiters = new Map<() => void, unknown>();
  let ready = false;
  let disposed = false;
  let polling = false;
  let retryTimer: unknown = null;
  let unsubscribeStatus: (() => void) | null = null;

  const notify = () => { for (const listener of listeners) listener(); };
  const stopRetry = () => {
    if (retryTimer != null) clock.clearTimeout(retryTimer);
    retryTimer = null;
  };
  const settleReady = () => {
    if (ready || disposed) return;
    ready = true;
    stopRetry();
    for (const resolve of waiters.keys()) resolve();
    waiters.clear();
    notify();
  };
  const runProbe = async () => {
    if (disposed || ready || polling || listeners.size === 0) return;
    polling = true;
    try {
      await probe();
      settleReady();
    } catch {
      if (!disposed && !ready && listeners.size > 0) {
        retryTimer = clock.setTimeout(() => { retryTimer = null; void runProbe(); }, ONBOARDING_BOX_PROBE_MS);
      }
    } finally {
      polling = false;
    }
  };

  return {
    getSnapshot() {
      return { isComputerReady: ready, ...status.getSnapshot() };
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      if (listeners.size === 1) {
        unsubscribeStatus = status.subscribe(notify);
        void runProbe();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopRetry();
          unsubscribeStatus?.();
          unsubscribeStatus = null;
        }
      };
    },
    waitForComputer() {
      if (ready || disposed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const finish = () => { clock.clearTimeout(deadline); waiters.delete(onReady); resolve(); };
        const onReady = () => finish();
        const deadline = clock.setTimeout(finish, ONBOARDING_BOX_WAIT_TIMEOUT_MS);
        waiters.set(onReady, deadline);
      });
    },
    dispose() {
      disposed = true;
      stopRetry();
      unsubscribeStatus?.();
      unsubscribeStatus = null;
      for (const [resolve, deadline] of waiters) {
        clock.clearTimeout(deadline);
        resolve();
      }
      waiters.clear();
      listeners.clear();
    },
  };
}

export function createCoordinatorOnboardingReadiness(
  client: ProductionCoordinatorClient,
  status?: OnboardingComputerStatusSource,
): OnboardingComputerReadiness {
  return createOnboardingComputerReadiness(() => client.call("countAgents"), { status });
}
