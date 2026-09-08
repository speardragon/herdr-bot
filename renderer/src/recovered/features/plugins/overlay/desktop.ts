import type {
  DesktopBridge,
  EffectivePlugin,
  McpAuthenticationResult,
  McpCatalogEntry,
  McpServerState,
  McpToolSummary,
  Unsubscribe
} from "../../../contracts/desktop-bridge";
import type { PluginBrowserItem } from "./browser";
import { groupPluginServerAccounts, pluginInstallMode, pluginPrivateSkillsFromCoordinator, type PluginInstallMode, type PluginPrivateSkill } from "./model";

export interface PluginPrivateSkillUpdateSpec {
  name: string;
  description: string;
  body: string;
  trigger: import("./model").PluginWorkflowTrigger | null;
  sourceRef: string | null;
}

export interface PluginPrivateSkillSource {
  deleteAgentWorkflow(agentId: string, workflowId: string): Promise<unknown>;
  updateAgentWorkflow(agentId: string, workflowId: string, spec: PluginPrivateSkillUpdateSpec): Promise<unknown>;
  getSkillPublishTargets(): Promise<unknown>;
  publishSkill(workflowId: string, teamId: string): Promise<unknown>;
  resyncPublishedSkill(workflowId: string): Promise<unknown>;
  unpublishSkill(workflowId: string): Promise<unknown>;
}

/**
 * The unmounted enable/disable seam from the shipped workflow provider. It is
 * intentionally separate from PluginPrivateSkillSource until the root passes
 * the exact callback into the Plugins surface.
 */
export interface PluginPrivateSkillEnableSource {
  setAgentWorkflowEnabled(agentId: string, workflowId: string, isEnabled: boolean): Promise<unknown>;
}

/**
 * The shipped plugin-install path refreshes plugin-backed skills after the
 * MCP mutation and removes the old workflow projections first.  Keep this
 * source separate from the MCP desktop bridge: it is a coordinator action and
 * the root can leave the seam absent until it owns the handoff.
 */
export interface PluginPrivateSkillSyncSource {
  syncPluginSkills(): Promise<unknown>;
  getAgentWorkflows(agentId: string): Promise<unknown>;
  deleteAgentWorkflow(agentId: string, workflowId: string): Promise<unknown>;
}

export type PluginPrivateSkillSyncSnapshot =
  | { status: "idle"; skills: readonly PluginPrivateSkill[]; pendingPluginId: null; added: null; error: null }
  | { status: "pending"; skills: readonly PluginPrivateSkill[]; pendingPluginId: string; added: null; error: null }
  | { status: "ready"; skills: readonly PluginPrivateSkill[]; pendingPluginId: null; added: number; error: null }
  | { status: "failed"; skills: readonly PluginPrivateSkill[]; pendingPluginId: null; added: null; error: unknown };

export interface PluginPrivateSkillSyncController {
  getSnapshot(): PluginPrivateSkillSyncSnapshot;
  subscribe(listener: () => void): () => void;
  setScope(agentId: string | null, skills: readonly PluginPrivateSkill[]): void;
  sync(pluginId: string, sourceRefs: readonly string[]): Promise<boolean>;
  reset(): void;
  dispose(): void;
}

function syncedPluginCount(value: unknown, pluginId: string): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((candidate) => typeof candidate === "object" && candidate != null && !Array.isArray(candidate) && (candidate as Record<string, unknown>).pluginId === pluginId).length;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=91167 (Mac syncPluginSkills install/remove refresh)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=113991 (Windows syncPluginSkills install/remove refresh)
export function createPluginPrivateSkillSyncController(source: PluginPrivateSkillSyncSource): PluginPrivateSkillSyncController {
  const listeners = new Set<() => void>();
  let agentId: string | null = null;
  let skills: PluginPrivateSkill[] = [];
  let snapshot: PluginPrivateSkillSyncSnapshot = { status: "idle", skills, pendingPluginId: null, added: null, error: null };
  let scopeGeneration = 0;
  let requestGeneration = 0;
  let disposed = false;

  const publish = (next: PluginPrivateSkillSyncSnapshot): void => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const isCurrent = (scope: number, request: number): boolean => !disposed && scope === scopeGeneration && request === requestGeneration;

  return {
    getSnapshot(): PluginPrivateSkillSyncSnapshot {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextAgentId: string | null, nextSkills: readonly PluginPrivateSkill[]): void {
      if (disposed) return;
      scopeGeneration += 1;
      requestGeneration += 1;
      agentId = nextAgentId;
      skills = [...nextSkills];
      if (nextAgentId == null) {
        publish({ status: "idle", skills, pendingPluginId: null, added: null, error: null });
      } else {
        publish({ status: "ready", skills, pendingPluginId: null, added: 0, error: null });
      }
    },
    async sync(pluginId: string, sourceRefs: readonly string[]): Promise<boolean> {
      if (disposed || agentId == null || snapshot.status === "pending") return false;
      const scope = scopeGeneration;
      const request = ++requestGeneration;
      const currentAgentId = agentId;
      const oldWorkflowIds = skills
        .filter((skill) => skill.sourceRef != null && sourceRefs.includes(skill.sourceRef))
        .map((skill) => skill.id);
      publish({ status: "pending", skills, pendingPluginId: pluginId, added: null, error: null });
      try {
        for (const workflowId of oldWorkflowIds) {
          await source.deleteAgentWorkflow(currentAgentId, workflowId);
          if (!isCurrent(scope, request)) return false;
        }
        const syncResult = await source.syncPluginSkills();
        if (!isCurrent(scope, request)) return false;
        const nextSkills = pluginPrivateSkillsFromCoordinator(await source.getAgentWorkflows(currentAgentId));
        if (!isCurrent(scope, request)) return false;
        skills = nextSkills;
        publish({ status: "ready", skills, pendingPluginId: null, added: syncedPluginCount(syncResult, pluginId), error: null });
        return true;
      } catch (error) {
        if (isCurrent(scope, request)) publish({ status: "failed", skills, pendingPluginId: null, added: null, error });
        return false;
      }
    },
    reset(): void {
      if (disposed) return;
      scopeGeneration += 1;
      requestGeneration += 1;
      agentId = null;
      skills = [];
      publish({ status: "idle", skills, pendingPluginId: null, added: null, error: null });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scopeGeneration += 1;
      requestGeneration += 1;
      listeners.clear();
    }
  };
}

export type PluginPrivateSkillEnableSnapshot =
  | { status: "idle"; skills: readonly PluginPrivateSkill[]; pendingWorkflowId: null; error: null }
  | { status: "pending"; skills: readonly PluginPrivateSkill[]; pendingWorkflowId: string; error: null }
  | { status: "ready"; skills: readonly PluginPrivateSkill[]; pendingWorkflowId: null; error: null }
  | { status: "failed"; skills: readonly PluginPrivateSkill[]; pendingWorkflowId: null; error: unknown };

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=95573 (Mac setEnabled action)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=120001 (Windows setEnabled action)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=137337 (authoritative workflow reply replacement)
export function createPluginPrivateSkillEnableController(source: PluginPrivateSkillEnableSource, initialSkills: readonly PluginPrivateSkill[] = []) {
  const listeners = new Set<() => void>();
  let agentId: string | null = null;
  let skills = [...initialSkills];
  let snapshot: PluginPrivateSkillEnableSnapshot = { status: "idle", skills, pendingWorkflowId: null, error: null };
  let scopeGeneration = 0;
  let requestGeneration = 0;
  let disposed = false;

  const publish = (next: PluginPrivateSkillEnableSnapshot): void => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const isCurrent = (scope: number, request: number): boolean => !disposed && scope === scopeGeneration && request === requestGeneration;

  return {
    getSnapshot(): PluginPrivateSkillEnableSnapshot {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextAgentId: string | null, nextSkills: readonly PluginPrivateSkill[] = []): void {
      if (disposed) return;
      scopeGeneration += 1;
      requestGeneration += 1;
      agentId = nextAgentId;
      skills = [...nextSkills];
      publish({ status: nextAgentId == null ? "idle" : "ready", skills, pendingWorkflowId: null, error: null });
    },
    async setEnabled(workflowId: string, isEnabled: boolean): Promise<boolean> {
      if (disposed || agentId == null || snapshot.status === "pending") return false;
      const scope = scopeGeneration;
      const request = ++requestGeneration;
      const currentAgentId = agentId;
      publish({ status: "pending", skills, pendingWorkflowId: workflowId, error: null });
      try {
        const raw = await source.setAgentWorkflowEnabled(currentAgentId, workflowId, isEnabled);
        if (!isCurrent(scope, request)) return false;
        skills = pluginPrivateSkillsFromCoordinator(raw);
        publish({ status: "ready", skills, pendingWorkflowId: null, error: null });
        return true;
      } catch (error) {
        if (isCurrent(scope, request)) publish({ status: "failed", skills, pendingWorkflowId: null, error });
        return false;
      }
    },
    reset(): void {
      if (disposed) return;
      scopeGeneration += 1;
      requestGeneration += 1;
      agentId = null;
      skills = [];
      publish({ status: "idle", skills, pendingWorkflowId: null, error: null });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scopeGeneration += 1;
      requestGeneration += 1;
      listeners.clear();
    }
  };
}

export type PluginPrivateSkillEnableController = ReturnType<typeof createPluginPrivateSkillEnableController>;

export type PluginPrivateSkillCopyStatus = "idle" | "copied" | "error";

export interface PluginPrivateSkillClipboard {
  writeText(value: string): Promise<void> | void;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=21575 (Mac marketplace link projection)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=26852 (Windows marketplace link projection)
export function pluginPrivateSkillMarketplaceUrl(pluginId: string): string {
  const url = new URL("https://cursor.com/marketplace");
  url.searchParams.set("pluginId", pluginId);
  return url.toString();
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=75453 (Mac copy-link labels)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=93898 (Windows copy-link labels)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2742558 (clipboard success/error/reset lifecycle)
export function createPluginPrivateSkillCopyController(clipboard: PluginPrivateSkillClipboard, durationMs = 2000) {
  const listeners = new Set<() => void>();
  let status: PluginPrivateSkillCopyStatus = "idle";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const publish = (next: PluginPrivateSkillCopyStatus): void => {
    if (disposed) return;
    status = next;
    for (const listener of [...listeners]) listener();
  };
  const scheduleReset = (): void => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      publish("idle");
    }, durationMs);
  };
  return {
    getSnapshot(): PluginPrivateSkillCopyStatus {
      return status;
    },
    subscribe(listener: () => void): () => void {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async copy(value: string): Promise<void> {
      if (disposed) return;
      try {
        await clipboard.writeText(value);
        if (disposed) return;
        publish("copied");
        scheduleReset();
      } catch {
        if (disposed) return;
        publish("error");
        scheduleReset();
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (timer != null) clearTimeout(timer);
      timer = null;
      listeners.clear();
    }
  };
}

export type PluginPrivateSkillCopyController = ReturnType<typeof createPluginPrivateSkillCopyController>;

export type PluginBrowserRemovalResult = {
  state: McpServerState;
  removed: boolean;
  reason?: "team-server" | "still-present";
};

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L137337
export async function deletePrivatePluginSkill(source: PluginPrivateSkillSource, agentId: string, workflowId: string): Promise<PluginPrivateSkill[]> {
  return pluginPrivateSkillsFromCoordinator(await source.deleteAgentWorkflow(agentId, workflowId));
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1396
export function pluginPrivateSkillDeletionNotice(name: string): string {
  return `Deleted ${name}`;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=94342 (Mac rename success notice)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=118257 (Windows rename success notice)
export function pluginAccountRenameNotice(newAccountKey: string): string {
  return `Renamed account to "${newAccountKey}"`;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=94548 (Mac remove success notice)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=118534 (Windows remove success notice)
export function pluginAccountRemovalNotice(accountKey: string): string {
  return `Removed the ${accountKey} account`;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L137337
export async function updatePrivatePluginSkill(source: PluginPrivateSkillSource, agentId: string, workflowId: string, spec: PluginPrivateSkillUpdateSpec): Promise<PluginPrivateSkill[]> {
  return pluginPrivateSkillsFromCoordinator(await source.updateAgentWorkflow(agentId, workflowId, spec));
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L137347
export async function loadPrivateSkillPublishTargets(source: PluginPrivateSkillSource): Promise<unknown> {
  return await source.getSkillPublishTargets();
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L137348
export async function publishPrivatePluginSkill(source: PluginPrivateSkillSource, workflowId: string, teamId: string): Promise<unknown> {
  return await source.publishSkill(workflowId, teamId);
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L137350
export async function resyncPublishedPluginSkill(source: PluginPrivateSkillSource, workflowId: string): Promise<unknown> {
  return await source.resyncPublishedSkill(workflowId);
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L137353
export async function unpublishPublishedPluginSkill(source: PluginPrivateSkillSource, workflowId: string): Promise<unknown> {
  return await source.unpublishSkill(workflowId);
}

export interface PluginsDesktopSnapshot {
  items: PluginBrowserItem[];
  catalog: McpCatalogEntry[];
  effectivePlugins: EffectivePlugin[];
  serverState: McpServerState;
}

export function pluginBrowserItemsFromDesktop(
  catalog: readonly McpCatalogEntry[],
  effectivePlugins: readonly EffectivePlugin[],
  serverState: McpServerState
): PluginBrowserItem[] {
  const effectiveById = new Map(effectivePlugins.map((plugin) => [plugin.pluginId, plugin]));
  const plugins: PluginBrowserItem[] = catalog.map((entry) => ({
    kind: "plugin",
    id: entry.id,
    displayName: entry.displayName,
    description: entry.description,
    ...(entry.publisher == null ? {} : { publisher: entry.publisher.displayName }),
    ...entry.fields != null && entry.fields.length > 0 ? { fields: entry.fields } : {},
    installed: effectiveById.has(entry.id),
    ...pluginInstallMode(effectiveById.get(entry.id)) !== "user" ? { installMode: pluginInstallMode(effectiveById.get(entry.id)) } : {},
    ...effectiveById.get(entry.id)?.hasTeamConfiguredVariables === true ? { hasTeamConfiguredVariables: true } : {}
  }));
  const servers: PluginBrowserItem[] = [...groupPluginServerAccounts(serverState.servers).values()].map((accounts) => {
    const server = accounts[0];
    const policy: PluginInstallMode = pluginInstallMode(server);
    const includeAccountDetails = accounts.length > 1 || policy !== "user";
    return {
      kind: "server",
      id: server.id,
      displayName: server.name,
      description: server.statusDetail ?? `${server.toolCount} tool${server.toolCount === 1 ? "" : "s"}`,
      ...(server.accountKey === "default" ? {} : { accountLabel: server.accountKey }),
      ...includeAccountDetails ? { accountSlots: accounts } : {},
      ...policy !== "user" ? { policy } : {},
      ...includeAccountDetails && server.url != null ? { url: server.url } : {},
      status: server.status === "connected"
        ? "connected"
        : server.status === "needsAuth"
          ? "authentication-required"
          : server.status === "initializing"
            ? "initializing"
            : server.status === "disconnected"
              ? "disconnected"
              : server.status === "disabledByTeamAdminPolicy"
                ? "disabled-by-team-admin-policy"
                : "failed"
    };
  });
  return [...plugins, ...servers];
}

export type PluginsDesktopControllerStatus = "idle" | "loading" | "ready" | "failed";

export interface PluginsDesktopControllerSnapshot {
  status: PluginsDesktopControllerStatus;
  data: PluginsDesktopSnapshot | null;
  failure: unknown | null;
  pendingKeys: readonly string[];
}

export interface PluginsDesktopController {
  getSnapshot(): PluginsDesktopControllerSnapshot;
  subscribe(listener: () => void): Unsubscribe;
  open(): void;
  close(): void;
  load(): Promise<PluginsDesktopSnapshot | null>;
  retry(): Promise<PluginsDesktopSnapshot | null>;
  execute<T>(key: string, action: () => Promise<T>): Promise<T>;
  dispose(): void;
}

// Immutable view-B5Ug8wEm.js: Ea/Ra/Ma own independent loading snapshots;
// Xi fences mutations through pending state and auth completion refetches the
// server projection. This controller is the non-root equivalent of that seam.
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1493 (Xi controller)
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1540 (catalog/server/effective providers)
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1614 (install/setup lifecycle)
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1693 (remove lifecycle)
export function createPluginsDesktopController(bridge: DesktopBridge): PluginsDesktopController {
  const listeners = new Set<() => void>();
  const pending = new Set<string>();
  let snapshot: PluginsDesktopControllerSnapshot = { status: "idle", data: null, failure: null, pendingKeys: [] };
  let lifecycleGeneration = 0;
  let requestGeneration = 0;
  let opened = false;
  let disposed = false;

  const publish = (next: PluginsDesktopControllerSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const publishPending = (status: PluginsDesktopControllerStatus = snapshot.status) => {
    publish({ ...snapshot, status, pendingKeys: [...pending] });
  };
  const isCurrent = (generation: number) => !disposed && opened && generation === lifecycleGeneration;

  const load = async (): Promise<PluginsDesktopSnapshot | null> => {
    if (disposed || !opened) return snapshot.data;
    const lifecycle = lifecycleGeneration;
    const request = ++requestGeneration;
    publish({ ...snapshot, status: "loading", failure: null, pendingKeys: [...pending] });
    try {
      const data = await loadPluginsDesktopSnapshot(bridge);
      if (!isCurrent(lifecycle) || request !== requestGeneration) return null;
      publish({ status: "ready", data, failure: null, pendingKeys: [...pending] });
      return data;
    } catch (failure: unknown) {
      if (isCurrent(lifecycle) && request === requestGeneration) {
        publish({ ...snapshot, status: "failed", failure, pendingKeys: [...pending] });
      }
      throw failure;
    }
  };

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open() {
      if (disposed || opened) return;
      opened = true;
      lifecycleGeneration += 1;
      snapshot = { status: "idle", data: null, failure: null, pendingKeys: [] };
      void load().catch(() => {});
    },
    close() {
      if (!opened) return;
      opened = false;
      lifecycleGeneration += 1;
      requestGeneration += 1;
      pending.clear();
      publish({ status: "idle", data: null, failure: null, pendingKeys: [] });
    },
    load,
    retry: load,
    async execute<T>(key: string, action: () => Promise<T>): Promise<T> {
      if (disposed || !opened) throw new Error("Plugins surface is not open");
      const lifecycle = lifecycleGeneration;
      pending.add(key);
      publishPending(snapshot.status);
      try {
        const result = await action();
        if (isCurrent(lifecycle)) await load();
        return result;
      } catch (failure: unknown) {
        if (isCurrent(lifecycle)) publish({ ...snapshot, status: "failed", failure, pendingKeys: [...pending] });
        throw failure;
      } finally {
        if (isCurrent(lifecycle)) {
          pending.delete(key);
          publishPending(snapshot.status);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      opened = false;
      lifecycleGeneration += 1;
      requestGeneration += 1;
      pending.clear();
      listeners.clear();
    }
  };
}

export async function loadPluginsDesktopSnapshot(bridge: DesktopBridge): Promise<PluginsDesktopSnapshot> {
  const [catalog, effectivePlugins, serverState] = await Promise.all([
    bridge.mcp.catalog(),
    bridge.mcp.effectivePlugins(),
    bridge.mcp.list()
  ]);
  return {
    items: pluginBrowserItemsFromDesktop(catalog, effectivePlugins, serverState),
    catalog,
    effectivePlugins,
    serverState
  };
}

export async function installMarketplacePlugin(bridge: DesktopBridge, pluginId: string, values?: Record<string, string>, hasTeamConfiguredVariables?: boolean): Promise<McpServerState> {
  return await bridge.mcp.install({ entryId: pluginId, ...(values == null ? {} : { values }), ...(hasTeamConfiguredVariables === true ? { hasTeamConfiguredVariables: true } : {}) });
}

export async function updateMarketplacePluginSetup(bridge: DesktopBridge, pluginId: string, values: Record<string, string>): Promise<McpServerState> {
  return await bridge.mcp.updatePluginInstall({ pluginId, values });
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L953
export async function listPluginServerTools(bridge: DesktopBridge, serverId: string): Promise<McpToolSummary[]> {
  return await bridge.mcp.listServerTools(serverId);
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L971
export async function togglePluginServerTool(bridge: DesktopBridge, serverId: string, toolName: string): Promise<McpToolSummary[]> {
  return await bridge.mcp.toggleToolDisabled({ serverId, toolName });
}

export async function removePluginBrowserItem(bridge: DesktopBridge, item: PluginBrowserItem): Promise<PluginBrowserRemovalResult> {
  if (item.kind === "plugin") return await bridge.mcp.uninstallPlugin(item.id);
  if (item.kind === "server") return await bridge.mcp.remove(item.id);
  throw new Error("Workflow removal is owned by its plugin install, not the MCP server bridge.");
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L352
export function pluginBrowserRemovalNotice(name: string, result: Pick<PluginBrowserRemovalResult, "removed" | "reason">): { kind: "success" | "error"; text: string } {
  if (result.removed) return { kind: "success", text: `Removed ${name}` };
  if (result.reason === "team-server") return { kind: "error", text: `${name} is provided by your team and can't be removed here` };
  return { kind: "error", text: `Couldn't remove ${name}. It may be managed elsewhere. Reopen settings and try again.` };
}

/** Mirrors the shipped Plugins view: begin auth, then hand its returned URL to the desktop opener. */
export async function authenticatePluginBrowserServer(
  bridge: DesktopBridge,
  serverId: string,
  accountKey = "default"
): Promise<McpAuthenticationResult> {
  const result = await bridge.mcp.authenticate(serverId, accountKey);
  if (result.status === "started") await bridge.openExternal(result.authorizationUrl);
  return result;
}
