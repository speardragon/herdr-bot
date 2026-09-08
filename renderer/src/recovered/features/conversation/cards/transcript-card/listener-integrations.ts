// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5628174 (AUn listener provider lifecycle)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5574385 (listener coordinator methods)
// @evidence src/app/dist/renderer/assets/view-3mdFcnEj.js#byteOffset=1515 (listener card projection)
// @evidence src/app/dist/renderer/assets/view-3mdFcnEj.js#byteOffset=1732 (connectPlatform action)

export type ListenerPlatform = "github" | "slack";

export interface ListenerIntegration {
  platform: ListenerPlatform;
  isConnected: boolean;
}

export interface ListenerIntegrationsView {
  integrations: readonly ListenerIntegration[];
}

export type ListenerIntegrationsSnapshot =
  | { status: "loading"; previous?: ListenerIntegrationsView }
  | { status: "ready"; value: ListenerIntegrationsView }
  | { status: "failed"; failure: unknown; previous?: ListenerIntegrationsView };

export interface ListenerIntegrationsSource {
  getListenerIntegrations(): Promise<unknown>;
  getListenerConnectUrl(input: { platform: ListenerPlatform }): Promise<{ url: string }>;
}

export interface ListenerIntegrationsDesktop {
  openExternal(url: string): Promise<void>;
}

export interface ListenerIntegrationsScope {
  accountSlot: string | null;
  agentId: string | null;
}

export interface ListenerIntegrationsProvider {
  readonly snapshots: {
    get(): ListenerIntegrationsSnapshot;
    subscribe(listener: () => void): () => void;
  };
  connectPlatform(platform: ListenerPlatform): Promise<void>;
  noteReconnect(): void;
  setScope(scope: ListenerIntegrationsScope): void;
  reset(): void;
  dispose(): void;
}

export interface ListenerIntegrationsProviderOptions {
  scope: ListenerIntegrationsScope;
  source: ListenerIntegrationsSource;
  desktop: ListenerIntegrationsDesktop;
  pollMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
}

const DEFAULT_POLL_MS = 5_000;
const EMPTY_VIEW: ListenerIntegrationsView = { integrations: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectPlatform(value: unknown): ListenerPlatform | null {
  return value === "github" || value === "slack" ? value : null;
}

export function projectListenerIntegrations(value: unknown): ListenerIntegrationsView {
  if (!isRecord(value) || !Array.isArray(value.integrations)) return EMPTY_VIEW;
  const integrations: ListenerIntegration[] = [];
  for (const candidate of value.integrations) {
    if (!isRecord(candidate)) continue;
    const platform = projectPlatform(candidate.platform);
    if (platform == null || typeof candidate.isConnected !== "boolean") continue;
    integrations.push({ platform, isConnected: candidate.isConnected });
  }
  return { integrations };
}

export function createListenerIntegrationsProvider(options: ListenerIntegrationsProviderOptions): ListenerIntegrationsProvider {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelSchedule = options.cancelSchedule ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let snapshot: ListenerIntegrationsSnapshot = { status: "loading" };
  let scope = { accountSlot: options.scope.accountSlot, agentId: options.scope.agentId };
  const listeners = new Set<() => void>();
  let subscriberCount = 0;
  let pollHandle: unknown = null;
  let request: Promise<void> | null = null;
  let generation = 0;
  let requestVersion = 0;
  let disposed = false;

  const emit = (next: ListenerIntegrationsSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const cancelPoll = () => {
    if (pollHandle == null) return;
    cancelSchedule(pollHandle);
    pollHandle = null;
  };
  const schedulePoll = () => {
    cancelPoll();
    if (disposed || subscriberCount === 0) return;
    pollHandle = schedule(() => {
      pollHandle = null;
      void refresh().finally(schedulePoll);
    }, pollMs);
  };
  const refresh = async (): Promise<void> => {
    if (disposed || request != null) return request ?? Promise.resolve();
    const requestGeneration = generation;
    const version = ++requestVersion;
    const previous = snapshot.status === "ready" ? snapshot.value : snapshot.status === "failed" ? snapshot.previous : undefined;
    emit(previous == null ? { status: "loading" } : { status: "loading", previous });
    const current = options.source.getListenerIntegrations().then((raw) => {
      if (disposed || requestGeneration !== generation || version !== requestVersion) return;
      emit({ status: "ready", value: projectListenerIntegrations(raw) });
    }, (failure: unknown) => {
      if (disposed || requestGeneration !== generation || version !== requestVersion) return;
      emit(previous == null ? { status: "failed", failure } : { status: "failed", failure, previous });
    }).finally(() => {
      if (request === current) request = null;
    });
    request = current;
    return current;
  };
  const ensurePolling = () => {
    if (disposed || subscriberCount === 0) return;
    if (pollHandle == null) {
      void refresh().finally(schedulePoll);
    }
  };

  return {
    snapshots: {
      get: () => snapshot,
      subscribe(listener) {
        if (disposed) return () => {};
        subscriberCount += 1;
        listeners.add(listener);
        if (pollHandle == null) ensurePolling();
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          subscriberCount = Math.max(0, subscriberCount - 1);
          listeners.delete(listener);
          if (subscriberCount === 0) cancelPoll();
        };
      },
    },
    async connectPlatform(platform) {
      if (disposed) return;
      const { url } = await options.source.getListenerConnectUrl({ platform });
      if (disposed) return;
      await options.desktop.openExternal(url);
      if (disposed) return;
      if (subscriberCount > 0 && pollHandle == null) ensurePolling();
      else void refresh();
    },
    noteReconnect() {
      if (disposed || subscriberCount === 0) return;
      if (pollHandle == null) ensurePolling();
      else void refresh();
    },
    setScope(nextScope) {
      if (disposed || scope.accountSlot === nextScope.accountSlot && scope.agentId === nextScope.agentId) return;
      scope = { accountSlot: nextScope.accountSlot, agentId: nextScope.agentId };
      generation += 1;
      requestVersion += 1;
      request = null;
      cancelPoll();
      emit({ status: "loading" });
      if (subscriberCount > 0) ensurePolling();
    },
    reset() {
      if (disposed) return;
      generation += 1;
      requestVersion += 1;
      request = null;
      cancelPoll();
      emit({ status: "loading" });
      if (subscriberCount > 0) ensurePolling();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      requestVersion += 1;
      cancelPoll();
      listeners.clear();
      subscriberCount = 0;
      request = null;
    },
  };
}
