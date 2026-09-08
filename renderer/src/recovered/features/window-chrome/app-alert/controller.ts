// The shipped app alert state machine is created once per coordinator client.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5581215
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=7005469

export type AppAlertFailure = string;
export type AppAlertCompletion = string | null | undefined | void;

export interface AppAlertSecondaryAction {
  readonly label: string;
  readonly destructive?: boolean;
  readonly perform?: () => Promise<AppAlertCompletion>;
}

export interface AppAlertRequest {
  readonly title: string;
  readonly description?: string;
  readonly body?: string;
  readonly warning?: string;
  readonly confirmLabel: string;
  readonly pendingLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly confirmLeadingIcon?: string;
  readonly secondary?: AppAlertSecondaryAction;
  readonly width?: "regular" | "wide";
  readonly perform?: () => Promise<AppAlertCompletion>;
}

export interface AppAlertState {
  readonly request: AppAlertRequest;
  readonly isPerforming: boolean;
  readonly failure: AppAlertFailure | null;
}

export interface AppAlertController {
  readonly getSnapshot: () => AppAlertState | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly alert: (request: AppAlertRequest) => Promise<boolean>;
  readonly confirm: () => void;
  readonly confirmSecondary: () => void;
  readonly cancel: () => void;
  readonly reset: () => void;
  readonly dispose: () => void;
}

interface QueuedAlert {
  readonly request: AppAlertRequest;
  readonly settle: (result: boolean) => void;
}

function normalizeFailure(error: unknown): AppAlertFailure {
  return error instanceof Error ? error.message : String(error);
}

export function createAppAlertController(): AppAlertController {
  const listeners = new Set<() => void>();
  let state: AppAlertState | null = null;
  let currentSettle: ((result: boolean) => void) | null = null;
  let queued: QueuedAlert | null = null;
  let generation = 0;
  let disposed = false;

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const setState = (next: AppAlertState | null): void => {
    state = next;
    notify();
  };

  const open = (request: AppAlertRequest, settle: (result: boolean) => void): void => {
    currentSettle = settle;
    setState({ request, isPerforming: false, failure: null });
  };

  const close = (result: boolean): void => {
    const settle = currentSettle;
    if (state == null || settle == null) return;
    currentSettle = null;
    generation += 1;
    setState(null);
    const next = queued;
    queued = null;
    if (next != null && !disposed) open(next.request, next.settle);
    settle(result);
  };

  const run = (select: (request: AppAlertRequest) => (() => Promise<AppAlertCompletion>) | undefined): void => {
    const current = state;
    if (current == null || current.isPerforming) return;
    const perform = select(current.request);
    if (perform == null) {
      close(true);
      return;
    }
    const runGeneration = generation;
    setState({ ...current, isPerforming: true, failure: null });
    void (async () => {
      let failure: AppAlertFailure | null = null;
      try {
        const result = await perform();
        if (result != null) failure = result;
      } catch (error) {
        failure = normalizeFailure(error);
      }
      if (runGeneration !== generation) return;
      if (failure == null) {
        close(true);
        return;
      }
      const latest = state;
      if (latest != null) setState({ ...latest, isPerforming: false, failure });
    })();
  };

  const controller: AppAlertController = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    alert(request) {
      if (disposed) return Promise.resolve(false);
      if (state != null) {
        if (request.cancelLabel != null || queued != null) return Promise.resolve(false);
        return new Promise<boolean>((settle) => {
          queued = { request, settle };
        });
      }
      return new Promise<boolean>((settle) => open(request, settle));
    },
    confirm() {
      run((request) => request.perform);
    },
    confirmSecondary() {
      run((request) => request.secondary?.perform);
    },
    cancel() {
      if (state?.isPerforming !== true) close(false);
    },
    reset() {
      const pending = queued;
      queued = null;
      pending?.settle(false);
      close(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const pending = queued;
      queued = null;
      pending?.settle(false);
      close(false);
      listeners.clear();
    }
  };

  return controller;
}
