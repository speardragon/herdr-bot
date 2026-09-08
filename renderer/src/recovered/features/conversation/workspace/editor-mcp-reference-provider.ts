import type {
  McpCatalogEntry,
  McpDesktopBridge,
  McpServerState,
  McpServerSummary,
  Unsubscribe,
} from "../../../contracts/desktop-bridge";
import {
  filterEditorSuggestionEntries,
  type EditorMcpSuggestion,
} from "./editor-suggestion-provider";

// Immutable e9n MCP-reference branch: getMcpReferences projects tools rows
// from serverIdentifier/name/accountKey/serverId/status/icon and inserts an
// mcp:${serverId} workflow-reference node. The current bridge's list/catalog
// methods are the only producer used here; PR and app actions remain absent.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4506017
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4514725
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4515910
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5653400
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5664683
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5666163

export interface EditorMcpReferenceScope {
  readonly accountKey: string | null;
  readonly agentId: string | null;
}

export type EditorMcpReferenceStatus = "idle" | "loading" | "ready" | "empty" | "failed" | "unavailable" | "cancelled";

export interface EditorMcpReferenceSnapshot {
  readonly status: EditorMcpReferenceStatus;
  readonly rows: readonly EditorMcpSuggestion[];
  readonly error?: unknown;
}

export interface EditorMcpReferenceProvider {
  getSnapshot(): EditorMcpReferenceSnapshot;
  getRows(query?: string): readonly EditorMcpSuggestion[];
  subscribe(listener: () => void): () => void;
  setScope(scope: EditorMcpReferenceScope): void;
  refresh(): Promise<EditorMcpReferenceSnapshot>;
  noteReconnect(): void;
  reset(): void;
  dispose(): void;
}

export type EditorMcpReferenceSource = Pick<McpDesktopBridge, "list" | "catalog" | "onAuthCompleted">;

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function safeAccountLabel(value: string): string {
  return value.replace(/["'`\[\]{}()<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 64);
}

function labelFor(server: McpServerSummary): string {
  return server.accountKey !== "default" ? `${server.name} (${safeAccountLabel(server.accountKey)})` : server.name;
}

function statusLabel(server: McpServerSummary): string {
  switch (server.status) {
    case "connected": return "connected";
    case "needsAuth": return "needs auth";
    case "error": return "error";
    case "initializing": return "connecting";
    case "disconnected": return "disconnected";
    case "disabledByTeamAdminPolicy": return "disabled";
    default: return server.accountKey === "default" ? server.url ?? "" : server.accountKey;
  }
}

function catalogFor(server: McpServerSummary, catalog: readonly McpCatalogEntry[]): McpCatalogEntry | null {
  const candidates = [server.serverIdentifier, server.name, server.id, server.rowServerIdentifier];
  return catalog.find((entry) => [entry.id, entry.name, entry.displayName].some((value) => {
    const candidate = nonEmpty(value);
    return candidate != null && candidates.some((wanted) => normalized(wanted) === normalized(candidate));
  })) ?? null;
}

export function projectEditorMcpReferences(
  state: McpServerState | null,
  catalog: readonly McpCatalogEntry[],
  accountKey: string | null,
): EditorMcpSuggestion[] {
  if (state == null || accountKey == null) return [];
  const rows: EditorMcpSuggestion[] = [];
  const seen = new Set<string>();
  for (const server of state.servers) {
    const serverIdentifier = nonEmpty(server.serverIdentifier);
    const serverId = nonEmpty(server.id);
    if (serverIdentifier == null || serverId == null || server.accountKey !== accountKey || seen.has(serverIdentifier)) continue;
    seen.add(serverIdentifier);
    const metadata = catalogFor(server, catalog);
    const label = labelFor(server);
    const subtitle = statusLabel(server);
    rows.push({
      key: `tools:mcp:${serverIdentifier}`,
      id: `mcp:${serverIdentifier}`,
      category: "tools",
      label,
      ...(subtitle.length === 0 ? {} : { subtitle }),
      keywords: [label, serverIdentifier, server.accountKey, subtitle].filter((value) => value.length > 0),
      icon: metadata?.iconUrl == null ? { type: "tool", fallback: "plug" } : { type: "tool", iconUrl: metadata.iconUrl },
      insert: {
        type: "workflow",
        id: `mcp:${serverId}`,
        label,
        ...(metadata?.iconUrl == null ? {} : { iconUrl: metadata.iconUrl }),
      },
    });
  }
  return rows;
}

function cloneScope(scope: EditorMcpReferenceScope): EditorMcpReferenceScope {
  return { accountKey: scope.accountKey, agentId: scope.agentId };
}

function sameScope(left: EditorMcpReferenceScope, right: EditorMcpReferenceScope): boolean {
  return left.accountKey === right.accountKey && left.agentId === right.agentId;
}

export function createEditorMcpReferenceProvider(source: EditorMcpReferenceSource): EditorMcpReferenceProvider {
  const listeners = new Set<() => void>();
  let scope: EditorMcpReferenceScope = { accountKey: null, agentId: null };
  let generation = 0;
  let requestGeneration = 0;
  let disposed = false;
  let snapshot: EditorMcpReferenceSnapshot = { status: "unavailable", rows: [] };
  let authUnsubscribe: Unsubscribe | null = null;

  const emit = () => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };
  const publish = (next: EditorMcpReferenceSnapshot) => {
    if (disposed) return;
    snapshot = next;
    emit();
  };
  const detachAuth = () => {
    authUnsubscribe?.();
    authUnsubscribe = null;
  };
  const provider: EditorMcpReferenceProvider = {
    getSnapshot: () => ({ ...snapshot, rows: [...snapshot.rows] }),
    getRows(query = "") {
      return filterEditorSuggestionEntries(snapshot.rows, query).filter((entry): entry is EditorMcpSuggestion => entry.category === "tools");
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      generation += 1;
      requestGeneration += 1;
      scope = cloneScope(nextScope);
      detachAuth();
      if (scope.accountKey != null && scope.agentId != null) {
        authUnsubscribe = source.onAuthCompleted((event) => {
          if (disposed || scope.accountKey == null || (event.accountKey != null && event.accountKey !== scope.accountKey)) return;
          void provider.refresh();
        });
      }
      publish(scope.accountKey == null || scope.agentId == null ? { status: "unavailable", rows: [] } : { status: "idle", rows: [] });
    },
    async refresh() {
      if (disposed || scope.accountKey == null || scope.agentId == null) return { status: "unavailable", rows: [] };
      const expectedGeneration = generation;
      const expectedRequest = ++requestGeneration;
      const previous = snapshot.rows;
      publish({ status: "loading", rows: previous });
      try {
        const [nextState, nextCatalog] = await Promise.all([source.list(), source.catalog()]);
        if (disposed || expectedGeneration !== generation || expectedRequest !== requestGeneration) return { status: "cancelled", rows: previous };
        const rows = projectEditorMcpReferences(nextState, nextCatalog, scope.accountKey);
        const next: EditorMcpReferenceSnapshot = rows.length === 0 ? { status: "empty", rows } : { status: "ready", rows };
        publish(next);
        return next;
      } catch (error) {
        if (disposed || expectedGeneration !== generation || expectedRequest !== requestGeneration) return { status: "cancelled", rows: previous };
        const next: EditorMcpReferenceSnapshot = { status: "failed", rows: previous, error };
        publish(next);
        return next;
      }
    },
    noteReconnect() {
      if (disposed) return;
      generation += 1;
      requestGeneration += 1;
      publish(scope.accountKey == null || scope.agentId == null ? { status: "unavailable", rows: [] } : { status: "idle", rows: [] });
    },
    reset() {
      if (disposed) return;
      generation += 1;
      requestGeneration += 1;
      publish({ status: "idle", rows: [] });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      requestGeneration += 1;
      detachAuth();
      listeners.clear();
    },
  };
  return provider;
}
