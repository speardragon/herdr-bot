import type { DesktopBridge, Unsubscribe } from "../../../contracts/desktop-bridge";

// Immutable renderer root: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5628893 (PUn controller)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5629164 (ceiling read)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5629506 (permission write)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5629572 (approval record)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5629651 (approval cleanup)

export type LocalToolPermission = "always" | "ask" | "never";

export type LocalToolPermissionSnapshot =
  | { status: "loading"; previous?: LocalToolPermission }
  | { status: "ready"; value: LocalToolPermission }
  | { status: "empty" }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; failure: unknown; previous?: LocalToolPermission };

export type LocalToolPermissionCeilingSnapshot =
  | { status: "loading" }
  | { status: "ready"; value: LocalToolPermission | null };

export interface PermissionSnapshotStore<Value> {
  get(): Value;
  subscribe(listener: () => void): Unsubscribe;
}

export interface LocalToolPermissionStore {
  snapshots: PermissionSnapshotStore<LocalToolPermissionSnapshot>;
  ceilingSnapshots: PermissionSnapshotStore<LocalToolPermissionCeilingSnapshot>;
  load(): Promise<void>;
  loadCeiling(): Promise<void>;
  noteReconnect(): void;
  setPermission(permission: LocalToolPermission): Promise<LocalToolPermission>;
  recordApproval(approvalId: string, action: unknown, target: unknown): Promise<void>;
  clearApprovals(): Promise<void>;
  dispose(): void;
}

type LocalToolPermissionBridge = DesktopBridge["localToolPermission"];

const CAPABILITY_UNAVAILABLE = "desktop-source/capability-unavailable";
const PERMISSION_LOADING: LocalToolPermissionSnapshot = { status: "loading" };
const CEILING_LOADING: LocalToolPermissionCeilingSnapshot = { status: "loading" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failureCode(reason: unknown): string | null {
  if (!isRecord(reason)) return null;
  if (typeof reason.code === "string") return reason.code;
  return isRecord(reason.failure) && typeof reason.failure.code === "string" ? reason.failure.code : null;
}

function normalizePermission(value: unknown): LocalToolPermission | null {
  return value === "always" || value === "ask" || value === "never" ? value : null;
}

function normalizeCeiling(value: unknown): LocalToolPermission | null {
  return normalizePermission(value);
}

function isReady(snapshot: LocalToolPermissionSnapshot): snapshot is { status: "ready"; value: LocalToolPermission } {
  return snapshot.status === "ready";
}

export function createLocalToolPermissionStore(bridge: LocalToolPermissionBridge): LocalToolPermissionStore {
  let permissionSnapshot: LocalToolPermissionSnapshot = PERMISSION_LOADING;
  let ceilingSnapshot: LocalToolPermissionCeilingSnapshot = CEILING_LOADING;
  const permissionListeners = new Set<() => void>();
  const ceilingListeners = new Set<() => void>();
  let permissionValue: LocalToolPermission | null = null;
  let permissionFlight: Promise<void> | null = null;
  let ceilingFlight: Promise<void> | null = null;
  let permissionVersion = 0;
  let ceilingVersion = 0;
  let writeVersion = 0;
  let disposed = false;

  const publishPermission = (next: LocalToolPermissionSnapshot) => {
    if (Object.is(next, permissionSnapshot)) return;
    permissionSnapshot = next;
    for (const listener of [...permissionListeners]) listener();
  };
  const publishCeiling = (next: LocalToolPermissionCeilingSnapshot) => {
    if (Object.is(next, ceilingSnapshot)) return;
    ceilingSnapshot = next;
    for (const listener of [...ceilingListeners]) listener();
  };
  const dispatchPermissionRead = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (permissionFlight != null) return permissionFlight;
    const version = ++permissionVersion;
    const previous = permissionValue;
    publishPermission(previous == null ? PERMISSION_LOADING : { status: "loading", previous });
    const flight = bridge.get().then((raw) => {
      if (disposed || version !== permissionVersion) return;
      const value = normalizePermission(raw);
      if (value == null) {
        permissionValue = null;
        publishPermission({ status: "empty" });
      } else {
        permissionValue = value;
        publishPermission({ status: "ready", value });
      }
    }, (reason: unknown) => {
      if (disposed || version !== permissionVersion) return;
      const code = failureCode(reason);
      if (code === CAPABILITY_UNAVAILABLE) {
        publishPermission({ status: "unavailable", reason: code });
      } else {
        publishPermission(previous == null ? { status: "failed", failure: reason } : { status: "failed", previous, failure: reason });
      }
    }).finally(() => {
      if (permissionFlight === flight) permissionFlight = null;
    });
    permissionFlight = flight;
    return flight;
  };
  const dispatchCeilingRead = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (ceilingFlight != null) return ceilingFlight;
    const version = ++ceilingVersion;
    const flight = bridge.ceiling().then((raw) => {
      if (disposed || version !== ceilingVersion) return;
      publishCeiling({ status: "ready", value: normalizeCeiling(raw) });
    }, () => {
      // PUn deliberately fails the ceiling closed to an unconstrained value when the read is unavailable.
      if (!disposed && version === ceilingVersion) publishCeiling({ status: "ready", value: null });
    }).finally(() => {
      if (ceilingFlight === flight) ceilingFlight = null;
    });
    ceilingFlight = flight;
    return flight;
  };
  const subscribe = <Value>(listeners: Set<() => void>, get: () => Value): PermissionSnapshotStore<Value> => ({
    get,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    }
  });

  return {
    snapshots: subscribe(permissionListeners, () => permissionSnapshot),
    ceilingSnapshots: subscribe(ceilingListeners, () => ceilingSnapshot),
    load() {
      if (permissionValue != null) return Promise.resolve();
      return dispatchPermissionRead();
    },
    loadCeiling() {
      return ceilingSnapshot.status === "ready" ? Promise.resolve() : dispatchCeilingRead();
    },
    noteReconnect() {
      if (disposed) return;
      const state = permissionSnapshot.status;
      if (permissionValue != null || state === "failed" || state === "empty") void dispatchPermissionRead();
    },
    setPermission(permission) {
      const version = ++writeVersion;
      const operationVersion = ++permissionVersion;
      const requested = permission;
      return Promise.resolve()
        .then(() => bridge.set(requested))
        .then((raw) => {
          const value = normalizePermission(raw) ?? requested;
          if (!disposed && version === writeVersion && operationVersion === permissionVersion) {
            permissionValue = value;
            publishPermission({ status: "ready", value });
          }
          return value;
        }, (reason: unknown) => {
          if (!disposed && version === writeVersion && operationVersion === permissionVersion) {
            const previous = permissionValue ?? (isReady(permissionSnapshot) ? permissionSnapshot.value : undefined);
            publishPermission(previous == null ? { status: "failed", failure: reason } : { status: "failed", previous, failure: reason });
          }
          throw reason;
        });
    },
    recordApproval(approvalId, action, target) {
      return bridge.recordApproval(approvalId, action, target);
    },
    clearApprovals() {
      return bridge.clearApprovals();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      permissionVersion += 1;
      ceilingVersion += 1;
      writeVersion += 1;
      permissionListeners.clear();
      ceilingListeners.clear();
    }
  };
}
