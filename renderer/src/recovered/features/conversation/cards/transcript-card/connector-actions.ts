import type {
  DesktopBridge,
  McpAuthenticationResult,
  McpCatalogEntry,
  McpServerState,
  McpServerSummary,
  Unsubscribe
} from "../../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/view-DqTN67x_.js#L1
// @evidence src/app/dist/renderer/assets/connector-card-BOH-l7tH.js#L1

/** The connector-list leaf's exact lower-case/alphanumeric identity rule. */
export function normalizeConnectorName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Preserves the first source connector occurrence while deduping by normalized identity. */
export function normalizeConnectorNames(connectors: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const connector of connectors) {
    const normalized = normalizeConnectorName(connector);
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(connector);
  }
  return result;
}

export interface ConnectorCardSnapshot {
  readonly catalog: readonly McpCatalogEntry[];
  readonly serverState: McpServerState;
}

export type ConnectorProviderStatus = "idle" | "loading" | "ready" | "failed";

export interface ConnectorActionFailure {
  readonly kind: "failed";
  readonly error: unknown;
}

export type ConnectorActionState =
  | { readonly status: "idle" }
  | { readonly status: "installing" }
  | { readonly status: "authenticating"; readonly serverId: string; readonly accountKey: string }
  | {
      readonly status: "waiting";
      readonly serverId: string;
      readonly accountKey: string;
      readonly authorizationUrl: string;
    }
  | { readonly status: "ready" }
  | ConnectorActionFailure;

export interface ConnectorProviderSnapshot {
  readonly status: ConnectorProviderStatus;
  readonly data: ConnectorCardSnapshot | null;
  readonly failure: unknown | null;
  readonly pendingKeys: readonly string[];
  readonly actions: Readonly<Record<string, ConnectorActionState>>;
}

export type ConnectorActionResult =
  | { readonly kind: "installed"; readonly state: McpServerState }
  | { readonly kind: "authentication"; readonly result: McpAuthenticationResult }
  | { readonly kind: "unavailable" };

export interface ConnectorProvider {
  getSnapshot(): ConnectorProviderSnapshot;
  subscribe(listener: () => void): Unsubscribe;
  open(): void;
  close(): void;
  load(): Promise<ConnectorCardSnapshot | null>;
  retry(connector?: string, accountKey?: string): Promise<ConnectorCardSnapshot | ConnectorActionResult | null>;
  connect(connector: string, accountKey?: string): Promise<ConnectorActionResult>;
  install(connector: string): Promise<ConnectorActionResult>;
  authenticate(serverId: string, accountKey?: string, connector?: string): Promise<ConnectorActionResult>;
  reopen(connector: string, accountKey?: string): Promise<boolean>;
  dispose(): void;
}

export interface ConnectorProviderOptions {
  readonly bridge: DesktopBridge;
}

function connectorServerCandidates(server: McpServerSummary): string[] {
  return [server.serverIdentifier, server.name, server.id, server.rowServerIdentifier, server.pluginId ?? ""];
}

function connectorCatalogCandidates(entry: McpCatalogEntry): string[] {
  return [entry.id, entry.name, entry.displayName];
}

export function findConnectorServer(
  state: McpServerState | null,
  connector: string,
  accountKey?: string
): McpServerSummary | null {
  if (state == null) return null;
  const wanted = normalizeConnectorName(connector);
  const matches = state.servers.filter((server) => connectorServerCandidates(server).some((candidate) => normalizeConnectorName(candidate) === wanted));
  if (matches.length === 0) return null;
  if (accountKey != null) return matches.find((server) => server.accountKey === accountKey) ?? null;
  return matches.find((server) => server.accountKey === "default") ?? matches[0];
}

export function findConnectorCatalogEntry(catalog: readonly McpCatalogEntry[], connector: string): McpCatalogEntry | null {
  const wanted = normalizeConnectorName(connector);
  return catalog.find((entry) => connectorCatalogCandidates(entry).some((candidate) => normalizeConnectorName(candidate) === wanted)) ?? null;
}

function connectorKey(connector: string, accountKey?: string): string {
  return `${normalizeConnectorName(connector)}:${accountKey ?? "default"}`;
}

function copyActions(actions: Readonly<Record<string, ConnectorActionState>>): Record<string, ConnectorActionState> {
  return { ...actions };
}

function canAuthenticate(server: McpServerSummary): boolean {
  return server.status === "needsAuth" || server.status === "disconnected" || server.status === "error";
}

/**
 * Provider/action boundary for the shipped send-message:connectors card.
 * Unsupported catalog shapes and team-policy-only servers intentionally return
 * `unavailable`; no renderer-local RPC or inferred action is introduced.
 */
export function createConnectorProvider({ bridge }: ConnectorProviderOptions): ConnectorProvider {
  const listeners = new Set<() => void>();
  const pending = new Set<string>();
  const actions: Record<string, ConnectorActionState> = {};
  const retries = new Map<string, () => Promise<ConnectorActionResult>>();
  const handoffs = new Map<string, { serverId: string; accountKey: string; authorizationUrl: string }>();
  let snapshot: ConnectorProviderSnapshot = { status: "idle", data: null, failure: null, pendingKeys: [], actions: {} };
  let generation = 0;
  let requestGeneration = 0;
  let opened = false;
  let disposed = false;
  let removeAuthListener: Unsubscribe | null = null;

  const publish = (next: Omit<ConnectorProviderSnapshot, "pendingKeys" | "actions">) => {
    if (disposed) return;
    snapshot = { ...next, pendingKeys: [...pending], actions: copyActions(actions) };
    for (const listener of [...listeners]) listener();
  };
  const publishCurrent = () => publish({ status: snapshot.status, data: snapshot.data, failure: snapshot.failure });
  const setAction = (key: string, state: ConnectorActionState) => {
    actions[key] = state;
    publishCurrent();
  };
  const isCurrent = (expectedGeneration: number, expectedRequest?: number): boolean =>
    !disposed && opened && generation === expectedGeneration && (expectedRequest == null || requestGeneration === expectedRequest);

  const load = async (): Promise<ConnectorCardSnapshot | null> => {
    if (disposed || !opened) return snapshot.data;
    const expectedGeneration = generation;
    const expectedRequest = ++requestGeneration;
    publish({ status: "loading", data: snapshot.data, failure: null });
    try {
      const [catalog, serverState] = await Promise.all([bridge.mcp.catalog(), bridge.mcp.list()]);
      if (!isCurrent(expectedGeneration, expectedRequest)) return null;
      const data = { catalog, serverState } satisfies ConnectorCardSnapshot;
      publish({ status: "ready", data, failure: null });
      return data;
    } catch (failure: unknown) {
      if (isCurrent(expectedGeneration, expectedRequest)) publish({ status: "failed", data: snapshot.data, failure });
      throw failure;
    }
  };

  const action = async (
    key: string,
    next: ConnectorActionState,
    operation: () => Promise<ConnectorActionResult>,
    handoff?: { serverId: string; accountKey: string }
  ): Promise<ConnectorActionResult> => {
    if (disposed || !opened) return { kind: "unavailable" };
    if (pending.has(key)) return { kind: "unavailable" };
    const expectedGeneration = generation;
    pending.add(key);
    setAction(key, next);
    try {
      const result = await operation();
      if (isCurrent(expectedGeneration)) {
        if (result.kind === "authentication" && result.result.status === "started") {
          const handoffDetails = handoff ?? { serverId: key.split(":", 1)[0], accountKey: key.split(":")[1] ?? "default" };
          handoffs.set(key, { ...handoffDetails, authorizationUrl: result.result.authorizationUrl });
          setAction(key, { status: "waiting", ...handoffDetails, authorizationUrl: result.result.authorizationUrl });
        } else setAction(key, { status: "ready" });
      }
      return result;
    } catch (error: unknown) {
      if (isCurrent(expectedGeneration)) setAction(key, { kind: "failed", error });
      throw error;
    } finally {
      if (isCurrent(expectedGeneration)) {
        pending.delete(key);
        publishCurrent();
      }
    }
  };

  const install = async (connector: string): Promise<ConnectorActionResult> => {
    const key = connectorKey(connector);
    const entry = findConnectorCatalogEntry(snapshot.data?.catalog ?? [], connector);
    if (entry == null) return { kind: "unavailable" };
    retries.set(key, () => install(connector));
    return action(key, { status: "installing" }, async () => {
      const state = await bridge.mcp.install({ entryId: entry.id });
      if (isCurrent(generation)) publish({ status: "ready", data: { catalog: snapshot.data?.catalog ?? [], serverState: state }, failure: null });
      return { kind: "installed", state };
    });
  };

  const authenticate = async (serverId: string, accountKey = "default", connector = serverId): Promise<ConnectorActionResult> => {
    const key = connectorKey(connector, accountKey);
    retries.set(key, () => authenticate(serverId, accountKey, connector));
    return action(key, { status: "authenticating", serverId, accountKey }, async () => {
      const result = await bridge.mcp.authenticate(serverId, accountKey, "connector_card");
      if (result.status === "started") await bridge.openExternal(result.authorizationUrl);
      return { kind: "authentication", result };
    }, { serverId, accountKey });
  };

  const connect = async (connector: string, accountKey?: string): Promise<ConnectorActionResult> => {
    const server = findConnectorServer(snapshot.data?.serverState ?? null, connector, accountKey);
    if (server != null) {
      if (server.isTeamServer || server.managedByTeamPluginPolicy === true || !canAuthenticate(server)) return { kind: "unavailable" };
      return authenticate(server.id, server.accountKey, connector);
    }
    return install(connector);
  };

  const open = () => {
    if (disposed || opened) return;
    opened = true;
    generation += 1;
    removeAuthListener = bridge.mcp.onAuthCompleted((event) => {
      if (!opened || disposed) return;
      void load().catch(() => {});
    });
    snapshot = { status: "idle", data: null, failure: null, pendingKeys: [], actions: {} };
    for (const key of Object.keys(actions)) delete actions[key];
    void load().catch(() => {});
  };

  const close = () => {
    if (!opened) return;
    opened = false;
    generation += 1;
    requestGeneration += 1;
    removeAuthListener?.();
    removeAuthListener = null;
    pending.clear();
    retries.clear();
    handoffs.clear();
    for (const key of Object.keys(actions)) delete actions[key];
    publish({ status: "idle", data: null, failure: null });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open,
    close,
    load,
    retry: async (connector, accountKey) => {
      if (connector == null) return load();
      const key = connectorKey(connector, accountKey);
      const retryAction = retries.get(key);
      if (retryAction == null) return { kind: "unavailable" };
      return retryAction();
    },
    connect,
    install,
    authenticate,
    reopen: async (connector, accountKey = "default") => {
      if (disposed || !opened) return false;
      const key = connectorKey(connector, accountKey);
      const handoff = handoffs.get(key);
      if (handoff == null) return false;
      await bridge.openExternal(handoff.authorizationUrl);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      opened = false;
      generation += 1;
      requestGeneration += 1;
      removeAuthListener?.();
      removeAuthListener = null;
      pending.clear();
      retries.clear();
      handoffs.clear();
      listeners.clear();
    }
  };
}
