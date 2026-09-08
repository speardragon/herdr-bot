import type { DesktopBridge, DesktopUpdateStatus, DesktopUpdateTrack, Unsubscribe } from "../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-BlqerJhg.js#byteOffset=25821 (update resource/loading and retry branch)
// @evidence recovered/frontend/app/assets/index-BlqerJhg.js#byteOffset=32239 (Windows update resource/loading and retry branch)
// @evidence src/app/dist/renderer/assets/index-BlqerJhg.js#byteOffset=28146 (track, auto-update, and restart action branches)
// @evidence recovered/frontend/app/assets/index-BlqerJhg.js#byteOffset=35168 (Windows track, auto-update, and restart action branches)

export type SettingsUpdateAction = "check" | "set-track" | "set-auto-update-when-idle" | "install";

export interface SettingsUpdateSnapshot {
  /** The last coordinator/desktop status; retained while a refresh is loading or failed. */
  status: DesktopUpdateStatus | null;
  isLoading: boolean;
  failure: unknown | null;
  pending: ReadonlySet<SettingsUpdateAction>;
}

export interface SettingsUpdateController {
  getSnapshot(): SettingsUpdateSnapshot;
  subscribe(listener: () => void): Unsubscribe;
  /** Starts the initial status read and subscribes to subsequent desktop events once. */
  connect(): Promise<DesktopUpdateStatus | null>;
  refresh(): Promise<DesktopUpdateStatus | null>;
  check(): Promise<DesktopUpdateStatus>;
  setTrack(track: DesktopUpdateTrack): Promise<DesktopUpdateStatus>;
  setAutoUpdateWhenIdle(enabled: boolean): Promise<DesktopUpdateStatus>;
  install(): Promise<void>;
  /** Clears local presentation state without fabricating a desktop status. */
  reset(): void;
  dispose(): void;
}

const EMPTY_PENDING: ReadonlySet<SettingsUpdateAction> = new Set();

export function createSettingsUpdateController(
  bridge: Pick<DesktopBridge, "update">
): SettingsUpdateController {
  let snapshot: SettingsUpdateSnapshot = {
    status: null,
    isLoading: false,
    failure: null,
    pending: EMPTY_PENDING
  };
  const listeners = new Set<() => void>();
  let disposed = false;
  let generation = 0;
  let actionGeneration = 0;
  let unsubscribe: Unsubscribe | null = null;

  const notify = () => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };
  const publish = (next: SettingsUpdateSnapshot) => {
    if (disposed) return;
    snapshot = next;
    notify();
  };
  const setPending = (action: SettingsUpdateAction, pending: boolean) => {
    const next = new Set(snapshot.pending);
    if (pending) next.add(action);
    else next.delete(action);
    publish({ ...snapshot, pending: next });
  };
  const updateStatus = (status: DesktopUpdateStatus) => {
    publish({ ...snapshot, status, isLoading: false, failure: null });
  };
  const onStatusEvent = (status: DesktopUpdateStatus) => updateStatus(status);

  const refresh = async (): Promise<DesktopUpdateStatus | null> => {
    if (disposed) return snapshot.status;
    const requestGeneration = ++generation;
    publish({ ...snapshot, isLoading: true, failure: null });
    try {
      const status = await bridge.update.getStatus();
      if (disposed || requestGeneration !== generation) return snapshot.status;
      updateStatus(status);
      return status;
    } catch (failure: unknown) {
      if (!disposed && requestGeneration === generation) {
        publish({ ...snapshot, isLoading: false, failure });
      }
      return snapshot.status;
    }
  };

  const connect = async (): Promise<DesktopUpdateStatus | null> => {
    if (disposed) return snapshot.status;
    if (unsubscribe == null) unsubscribe = bridge.update.onStatusEvent(onStatusEvent);
    return refresh();
  };

  const run = async <Action extends SettingsUpdateAction, Value>(
    action: Action,
    operation: () => Promise<Value>,
    apply: (value: Value) => void
  ): Promise<Value> => {
    if (disposed) return Promise.reject(new Error("Settings update controller disposed"));
    const requestGeneration = ++actionGeneration;
    publish({ ...snapshot, failure: null });
    setPending(action, true);
    try {
      const value = await operation();
      if (!disposed && requestGeneration === actionGeneration) apply(value);
      return value;
    } catch (failure: unknown) {
      if (!disposed && requestGeneration === actionGeneration) publish({ ...snapshot, failure });
      throw failure;
    } finally {
      if (!disposed) setPending(action, false);
    }
  };

  const check = () => run("check", () => bridge.update.check(), (status) => updateStatus(status));
  const setTrack = (track: DesktopUpdateTrack) => run("set-track", () => bridge.update.setTrack(track), (status) => updateStatus(status));
  const setAutoUpdateWhenIdle = (enabled: boolean) => run(
    "set-auto-update-when-idle",
    () => bridge.update.setAutoUpdateWhenIdleOptIn(enabled),
    (status) => updateStatus(status)
  );
  const install = () => run("install", () => bridge.update.quitAndInstall(), () => undefined);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect,
    refresh,
    check,
    setTrack,
    setAutoUpdateWhenIdle,
    install,
    reset() {
      if (disposed) return;
      generation += 1;
      actionGeneration += 1;
      publish({ status: null, isLoading: false, failure: null, pending: EMPTY_PENDING });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      actionGeneration += 1;
      unsubscribe?.();
      unsubscribe = null;
      listeners.clear();
    }
  };
}
