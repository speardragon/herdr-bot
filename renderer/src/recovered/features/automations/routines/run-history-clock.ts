import type { DesktopTimeZoneState } from "../../../contracts/desktop-bridge";
import type { RoutineRunHistoryClock } from "./run-history-provider";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2621467 (agents-now-tick, 30s)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=810945 (time-zone snapshot and UTC fallback)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=810652 (detected timezone)

export const ROUTINE_RUN_HISTORY_CLOCK_NAME = "agents-now-tick" as const;
export const ROUTINE_RUN_HISTORY_CLOCK_INTERVAL_MS = 30_000;

export interface RoutineRunHistoryClockTimer {
  dispose(): void;
}

export interface RoutineRunHistoryClockScheduler {
  schedule(input: {
    readonly name: typeof ROUTINE_RUN_HISTORY_CLOCK_NAME;
    readonly intervalMs: typeof ROUTINE_RUN_HISTORY_CLOCK_INTERVAL_MS;
    readonly callback: () => void;
  }): RoutineRunHistoryClockTimer;
}

export interface RoutineRunHistoryClockOwner extends RoutineRunHistoryClock {
  ingestTimeZone(state: DesktopTimeZoneState): void;
  dispose(): void;
}

/** The renderer's existing 30-second scheduler, kept lazy for closed panes and SSR. */
export const browserRoutineRunHistoryScheduler: RoutineRunHistoryClockScheduler = {
  schedule({ intervalMs, callback }) {
    if (typeof window === "undefined") return { dispose() {} };
    const handle = window.setInterval(callback, intervalMs);
    return { dispose: () => window.clearInterval(handle) };
  }
};

export function detectRoutineRunHistoryTimeZone(): DesktopTimeZoneState {
  let detectedTimeZone: string | null = null;
  try {
    detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    detectedTimeZone = null;
  }
  return { detectedTimeZone, overrideTimeZone: null };
}

function resolveTimeZone(state: DesktopTimeZoneState): string {
  return state.overrideTimeZone ?? state.detectedTimeZone ?? "UTC";
}

/**
 * Shared non-root owner for the shipped routines relative-time clock.
 *
 * The root supplies the initial/settings timezone snapshot and scheduler;
 * this leaf deliberately has no bridge polling or settings ownership.
 */
export function createRoutineRunHistoryClockOwner(options: {
  readonly initialTimeZone: DesktopTimeZoneState;
  readonly now?: () => number;
  readonly scheduler: RoutineRunHistoryClockScheduler;
}): RoutineRunHistoryClockOwner {
  const now = options.now ?? Date.now;
  let timeZone = resolveTimeZone(options.initialTimeZone);
  let disposed = false;
  let timer: RoutineRunHistoryClockTimer | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    if (!disposed) for (const listener of listeners) listener();
  };
  const stopTimer = () => {
    timer?.dispose();
    timer = null;
  };
  const startTimer = () => {
    if (timer == null && listeners.size > 0) {
      timer = options.scheduler.schedule({
        name: ROUTINE_RUN_HISTORY_CLOCK_NAME,
        intervalMs: ROUTINE_RUN_HISTORY_CLOCK_INTERVAL_MS,
        callback: notify
      });
    }
  };

  return {
    now,
    timeZone: () => timeZone,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      startTimer();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopTimer();
      };
    },
    ingestTimeZone(state) {
      if (disposed) return;
      const next = resolveTimeZone(state);
      if (next === timeZone) return;
      timeZone = next;
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopTimer();
      listeners.clear();
    }
  };
}
