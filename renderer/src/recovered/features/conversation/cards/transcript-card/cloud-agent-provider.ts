import type { TranscriptCardScope } from "./protocol";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5590234 (cloud-agent watcher/poll provider)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5567167 (getCloudAgentInfo coordinator contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5733167 (account-scoped cloudAgents root state)
// @evidence src/app/dist/renderer/assets/view-CizPQWLy.js#byteOffset=0 (cloud-agent card states and Open in Cursor action)

export type CloudAgentStatus = "creating" | "running" | "finished" | "error" | "expired" | "unknown";

export interface CloudAgentInfo {
  bcId: string;
  name?: string;
  prompt?: string;
  status: CloudAgentStatus;
  branchName?: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  prUrl?: string;
  prState?: string;
  prNumber?: number;
}

export type CloudAgentSnapshot =
  | { status: "empty"; value: null; previous: CloudAgentInfo | null }
  | { status: "loading"; value: null; previous: CloudAgentInfo | null }
  | { status: "ready"; value: CloudAgentInfo; previous: CloudAgentInfo | null }
  | { status: "failed"; value: null; previous: CloudAgentInfo | null };

export interface CloudAgentCardValue {
  readonly info: CloudAgentInfo | null;
  readonly isPending: boolean;
}

export interface CloudAgentInfoSource {
  call(method: string, args?: unknown): Promise<unknown>;
}

export interface CloudAgentOpener {
  openCloudAgent(bcId: string): Promise<void>;
}

export interface CloudAgentWatcher {
  readonly bcId: string;
  getSnapshot(): CloudAgentSnapshot;
  subscribe(listener: () => void): () => void;
  release(): void;
}

export interface CloudAgentProvider {
  getSnapshot(bcId: string): CloudAgentSnapshot;
  getCardValue(bcId: string): CloudAgentCardValue;
  watchInfo(bcId: string): CloudAgentWatcher;
  watchName(bcId: string): CloudAgentWatcher;
  open(bcId: string): Promise<void>;
  setScope(scope: TranscriptCardScope): void;
  dispose(): void;
}

export interface CloudAgentProviderOptions {
  scope: TranscriptCardScope;
  source: CloudAgentInfoSource;
  opener: CloudAgentOpener;
  livePollMs?: number;
  recoveryPollMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
}

const terminalStatuses = new Set<CloudAgentStatus>(["finished", "error", "expired"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function status(value: unknown): CloudAgentStatus {
  return value === "creating" || value === "running" || value === "finished" || value === "error" || value === "expired" ? value : "unknown";
}

function projectInfo(value: unknown, expectedBcId: string): CloudAgentInfo | null {
  if (!isRecord(value) || typeof value.bcId !== "string" || value.bcId !== expectedBcId) return null;
  return {
    bcId: value.bcId,
    ...(optionalString(value.name) == null ? {} : { name: optionalString(value.name) }),
    ...(optionalString(value.prompt) == null ? {} : { prompt: optionalString(value.prompt) }),
    status: status(value.status),
    ...(optionalString(value.branchName) == null ? {} : { branchName: optionalString(value.branchName) }),
    ...(optionalFiniteNumber(value.filesChanged) === undefined ? {} : { filesChanged: optionalFiniteNumber(value.filesChanged) }),
    ...(optionalFiniteNumber(value.linesAdded) === undefined ? {} : { linesAdded: optionalFiniteNumber(value.linesAdded) }),
    ...(optionalFiniteNumber(value.linesRemoved) === undefined ? {} : { linesRemoved: optionalFiniteNumber(value.linesRemoved) }),
    ...(optionalString(value.prUrl) == null ? {} : { prUrl: optionalString(value.prUrl) }),
    ...(optionalString(value.prState) == null ? {} : { prState: optionalString(value.prState) }),
    ...(optionalFiniteNumber(value.prNumber) === undefined ? {} : { prNumber: optionalFiniteNumber(value.prNumber) }),
  };
}

export function createCloudAgentInfoSource(source: CloudAgentInfoSource): CloudAgentInfoSource {
  return {
    call: async (method, args) => {
      if (method !== "getCloudAgentInfo") throw new Error(`Unsupported cloud-agent method: ${method}`);
      if (!isRecord(args) || typeof args.bcId !== "string" || args.includeFiles !== false) throw new Error("getCloudAgentInfo requires includeFiles=false");
      return await source.call(method, { bcId: args.bcId, includeFiles: false });
    },
  };
}

export function createCloudAgentProvider(options: CloudAgentProviderOptions): CloudAgentProvider {
  const livePollMs = options.livePollMs ?? 5_000;
  const recoveryPollMs = options.recoveryPollMs ?? 60_000;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelSchedule = options.cancelSchedule ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const records = new Map<string, {
    snapshot: CloudAgentSnapshot;
    listeners: Set<() => void>;
    watchers: number;
    timer: unknown;
    requestToken: number;
    nameOnlyWatchers: number;
  }>();
  let scope = { accountSlot: options.scope.accountSlot, agentId: options.scope.agentId };
  let generation = 0;
  let disposed = false;

  const recordFor = (bcId: string) => {
    const existing = records.get(bcId);
    if (existing != null) return existing;
    const created = {
      snapshot: { status: "empty", value: null, previous: null } as CloudAgentSnapshot,
      listeners: new Set<() => void>(),
      watchers: 0,
      timer: null,
      requestToken: 0,
      nameOnlyWatchers: 0,
    };
    records.set(bcId, created);
    return created;
  };
  const emit = (record: ReturnType<typeof recordFor>) => {
    for (const listener of [...record.listeners]) listener();
  };
  const cancelTimer = (record: ReturnType<typeof recordFor>) => {
    if (record.timer == null) return;
    cancelSchedule(record.timer);
    record.timer = null;
  };
  const schedulePoll = (bcId: string, record: ReturnType<typeof recordFor>, delayMs: number) => {
    cancelTimer(record);
    if (disposed || record.watchers === 0) return;
    record.timer = schedule(() => { record.timer = null; void fetchInfo(bcId, record); }, delayMs);
  };
  const fetchInfo = async (bcId: string, record: ReturnType<typeof recordFor>): Promise<void> => {
    if (disposed || record.watchers === 0 || scope.agentId == null) return;
    const requestGeneration = generation;
    const requestToken = ++record.requestToken;
    const previous = record.snapshot.status === "ready" ? record.snapshot.value : record.snapshot.previous;
    record.snapshot = { status: "loading", value: null, previous };
    emit(record);
    try {
      const raw = await options.source.call("getCloudAgentInfo", { bcId, includeFiles: false });
      if (disposed || requestGeneration !== generation || requestToken !== record.requestToken || record.watchers === 0) return;
      const value = raw == null ? null : projectInfo(raw, bcId);
      if (value == null) {
        record.snapshot = { status: "empty", value: null, previous };
        emit(record);
        schedulePoll(bcId, record, recoveryPollMs);
        return;
      }
      record.snapshot = { status: "ready", value, previous };
      emit(record);
      if (!terminalStatuses.has(value.status)) schedulePoll(bcId, record, livePollMs);
    } catch {
      if (disposed || requestGeneration !== generation || requestToken !== record.requestToken || record.watchers === 0) return;
      record.snapshot = { status: "failed", value: null, previous };
      emit(record);
      schedulePoll(bcId, record, recoveryPollMs);
    }
  };

  const watch = (bcId: string, nameOnly: boolean): CloudAgentWatcher => {
    const record = recordFor(bcId);
    record.watchers += 1;
    if (nameOnly) record.nameOnlyWatchers += 1;
    if (record.snapshot.status === "empty" || record.snapshot.status === "failed") void fetchInfo(bcId, record);
    let released = false;
    return {
      bcId,
      getSnapshot: () => record.snapshot,
      subscribe(listener) {
        if (released || disposed) return () => {};
        record.listeners.add(listener);
        return () => record.listeners.delete(listener);
      },
      release() {
        if (released) return;
        released = true;
        record.watchers = Math.max(0, record.watchers - 1);
        if (nameOnly) record.nameOnlyWatchers = Math.max(0, record.nameOnlyWatchers - 1);
        if (record.watchers === 0) {
          record.requestToken += 1;
          cancelTimer(record);
          record.listeners.clear();
        }
      },
    };
  };

  return {
    getSnapshot(bcId) {
      return recordFor(bcId).snapshot;
    },
    getCardValue(bcId) {
      const snapshot = recordFor(bcId).snapshot;
      return { info: snapshot.status === "ready" ? snapshot.value : snapshot.previous, isPending: snapshot.status === "loading" };
    },
    watchInfo: (bcId) => watch(bcId, false),
    watchName: (bcId) => watch(bcId, true),
    async open(bcId) {
      if (disposed || scope.agentId == null || bcId.trim().length === 0) return;
      await options.opener.openCloudAgent(bcId);
    },
    setScope(nextScope) {
      if (disposed || scope.accountSlot === nextScope.accountSlot && scope.agentId === nextScope.agentId) return;
      generation += 1;
      for (const record of records.values()) {
        record.requestToken += 1;
        cancelTimer(record);
        record.listeners.clear();
      }
      records.clear();
      scope = { accountSlot: nextScope.accountSlot, agentId: nextScope.agentId };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      for (const record of records.values()) {
        record.requestToken += 1;
        cancelTimer(record);
        record.listeners.clear();
      }
      records.clear();
    },
  };
}

