// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5575393 (NPe keyed async-task snapshot store; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5577089 (i$n getAsyncTasks provider binding; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=7007341 (NPe keyed async-task snapshot store; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=7009813 (i$n getAsyncTasks provider binding; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

export type AsyncTaskKind = "subagent" | "shell" | "cloud-agent";

export interface AsyncTask {
  readonly kind: AsyncTaskKind;
  readonly id: string;
  readonly label: string;
  readonly status: "running";
  readonly startedAtMs: number;
  readonly detail?: string;
  readonly subagentType?: string;
}

export type AsyncTasksSnapshot =
  | { readonly status: "loading" }
  | { readonly status: "empty" }
  | { readonly status: "ready"; readonly value: readonly AsyncTask[] }
  | { readonly status: "failed"; readonly failure: unknown }
  | { readonly status: "failed"; readonly previous: readonly AsyncTask[]; readonly failure: unknown }
  | { readonly status: "unavailable"; readonly reason: string };

export interface AsyncTasksRequestOptions {
  readonly signal?: AbortSignal;
}

/** Exact coordinator contract: getAsyncTasks({ id }) returns an array. */
export interface AsyncTasksCoordinator {
  getAsyncTasks(args: { readonly id: string }, options?: AsyncTasksRequestOptions): Promise<unknown>;
}

export interface AsyncTasksSnapshotHandle {
  get(): AsyncTasksSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface AsyncTasksEvent {
  readonly parentAgentId: string;
  readonly tasks: readonly AsyncTask[];
}

export interface AsyncTasksProvider {
  snapshotsFor(agentId: string): AsyncTasksSnapshotHandle;
  refresh(agentId: string): void;
  connect(): void;
  noteReconnect(): void;
  reset(): void;
  dispose(): void;
  ingestAsyncTasksEvent(event: unknown): void;
}

const LOADING: AsyncTasksSnapshot = { status: "loading" };
const EMPTY: AsyncTasksSnapshot = { status: "empty" };
const CAPABILITY_UNAVAILABLE = "source/capability-unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTask(value: unknown): AsyncTask | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "subagent" && value.kind !== "shell" && value.kind !== "cloud-agent") return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (typeof value.label !== "string" || value.label.length === 0) return null;
  if (value.status !== "running" || typeof value.startedAtMs !== "number" || !Number.isFinite(value.startedAtMs)) return null;
  if (value.detail !== undefined && typeof value.detail !== "string") return null;
  if (value.subagentType !== undefined && typeof value.subagentType !== "string") return null;
  return {
    kind: value.kind,
    id: value.id,
    label: value.label,
    status: "running",
    startedAtMs: value.startedAtMs,
    ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
    ...(typeof value.subagentType === "string" ? { subagentType: value.subagentType } : {}),
  };
}

function parseTasks(value: unknown): readonly AsyncTask[] | null {
  if (!Array.isArray(value)) return null;
  const tasks = value.map(parseTask);
  return tasks.every((task): task is AsyncTask => task != null) ? tasks : null;
}

function failureCode(error: unknown): string | null {
  if (!isRecord(error) || typeof error.code !== "string") return null;
  return error.code;
}

function disposeSubscription(subscription: (() => void) | { dispose(): void }): void {
  if (typeof subscription === "function") subscription();
  else subscription.dispose();
}

interface Entry {
  readonly agentId: string;
  installed: readonly AsyncTask[] | null;
  failure: unknown | null;
  fetchAttempt: number;
  isFetchInFlight: boolean;
  isRefreshQueued: boolean;
  watchers: number;
  request: Promise<void> | null;
  snapshot: AsyncTasksSnapshot;
  readonly listeners: Set<() => void>;
}

function project(entry: Entry): AsyncTasksSnapshot {
  if (entry.failure != null) {
    if (failureCode(entry.failure) === CAPABILITY_UNAVAILABLE) return { status: "unavailable", reason: CAPABILITY_UNAVAILABLE };
    return entry.installed == null
      ? { status: "failed", failure: entry.failure }
      : { status: "failed", previous: entry.installed, failure: entry.failure };
  }
  if (entry.installed == null) return LOADING;
  return entry.installed.length > 0 ? { status: "ready", value: entry.installed } : entry.isFetchInFlight ? LOADING : EMPTY;
}

function eventValue(value: unknown): AsyncTasksEvent | null {
  if (!isRecord(value) || typeof value.parentAgentId !== "string" || value.parentAgentId.length === 0) return null;
  const tasks = parseTasks(value.tasks);
  return tasks == null ? null : { parentAgentId: value.parentAgentId, tasks };
}

export function formatAsyncTaskTime(timestampMs: number, nowMs: number): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0 || !Number.isFinite(nowMs)) return "";
  const elapsedMs = Math.max(0, nowMs - timestampMs);
  const seconds = Math.floor(elapsedMs / 1_000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function createAsyncTasksProvider(coordinator: AsyncTasksCoordinator): AsyncTasksProvider {
  const entries = new Map<string, Entry>();
  let connected = false;
  let disposed = false;

  const notify = (entry: Entry): void => {
    if (disposed) return;
    entry.snapshot = project(entry);
    for (const listener of [...entry.listeners]) listener();
  };
  const entryFor = (agentId: string): Entry => {
    const existing = entries.get(agentId);
    if (existing != null) return existing;
    const entry: Entry = {
      agentId,
      installed: null,
      failure: null,
      fetchAttempt: 0,
      isFetchInFlight: false,
      isRefreshQueued: false,
      watchers: 0,
      request: null,
      snapshot: LOADING,
      listeners: new Set(),
    };
    entries.set(agentId, entry);
    return entry;
  };
  const dispatch = (entry: Entry): void => {
    if (disposed || !connected || entry.isFetchInFlight) return;
    entry.isFetchInFlight = true;
    notify(entry);
    const attempt = entry.fetchAttempt;
    const request = coordinator.getAsyncTasks({ id: entry.agentId }).then((raw) => {
      const tasks = parseTasks(raw);
      if (tasks == null) throw new Error("malformed async tasks reply");
      if (disposed || attempt !== entry.fetchAttempt) return;
      entry.installed = tasks;
      entry.failure = null;
    }).catch((error: unknown) => {
      if (disposed || attempt !== entry.fetchAttempt) return;
      entry.failure = error;
    }).finally(() => {
      if (disposed || attempt !== entry.fetchAttempt) return;
      entry.isFetchInFlight = false;
      entry.request = null;
      if (entry.isRefreshQueued) {
        entry.isRefreshQueued = false;
        dispatch(entry);
      } else notify(entry);
    });
    entry.request = request;
  };
  const refreshEntry = (entry: Entry): void => {
    if (disposed || !connected) return;
    if (entry.isFetchInFlight) {
      entry.isRefreshQueued = true;
      return;
    }
    dispatch(entry);
  };
  const refreshWatched = (): void => {
    for (const entry of entries.values()) if (entry.watchers > 0) refreshEntry(entry);
  };

  return {
    snapshotsFor(agentId) {
      const entry = entryFor(agentId);
      return {
        get: () => entry.snapshot,
        subscribe(listener) {
          if (disposed) return () => {};
          entry.watchers += 1;
          if (entry.watchers === 1 && entry.installed != null && entry.failure == null) refreshEntry(entry);
          else if (entry.installed == null || entry.failure != null) refreshEntry(entry);
          entry.listeners.add(listener);
          let released = false;
          return () => {
            if (released) return;
            released = true;
            entry.watchers = Math.max(0, entry.watchers - 1);
            entry.listeners.delete(listener);
          };
        },
      };
    },
    refresh(agentId) { refreshEntry(entryFor(agentId)); },
    connect() {
      if (disposed || connected) return;
      connected = true;
      refreshWatched();
    },
    noteReconnect() {
      if (disposed || !connected) return;
      for (const entry of entries.values()) {
        if (entry.isFetchInFlight) {
          entry.fetchAttempt += 1;
          entry.isFetchInFlight = false;
          entry.isRefreshQueued = false;
          entry.request = null;
        }
        if (entry.watchers > 0) refreshEntry(entry);
      }
    },
    reset() {
      if (disposed) return;
      connected = false;
      for (const entry of entries.values()) {
        entry.fetchAttempt += 1;
        entry.installed = null;
        entry.failure = null;
        entry.isFetchInFlight = false;
        entry.isRefreshQueued = false;
        entry.request = null;
        notify(entry);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) {
        entry.fetchAttempt += 1;
        entry.isFetchInFlight = false;
        entry.isRefreshQueued = false;
        entry.request = null;
        entry.listeners.clear();
      }
      entries.clear();
    },
    ingestAsyncTasksEvent(payload) {
      if (disposed) return;
      const event = eventValue(payload);
      if (event == null) return;
      const entry = entryFor(event.parentAgentId);
      entry.fetchAttempt += 1;
      entry.isFetchInFlight = false;
      entry.isRefreshQueued = false;
      entry.request = null;
      entry.installed = event.tasks;
      entry.failure = null;
      notify(entry);
    },
  };
}
