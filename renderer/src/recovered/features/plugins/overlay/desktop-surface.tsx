import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DesktopBridge } from "../../../contracts/desktop-bridge";
import type { PluginBrowserItem } from "./browser";
import type { PluginGitHubAuthBannerProps } from "./github-auth-banner";
import { pluginAuthenticationNotice, pluginPrivateSkillsFromCoordinator, pluginSkillPublishTargetsFromCoordinator, type PluginPrivateSkill, type PluginSkillPublishTargets } from "./model";
import {
  authenticatePluginBrowserServer,
  createPluginPrivateSkillEnableController,
  pluginAccountRemovalNotice,
  pluginAccountRenameNotice,
  deletePrivatePluginSkill,
  pluginPrivateSkillDeletionNotice,
  loadPrivateSkillPublishTargets,
  installMarketplacePlugin,
  listPluginServerTools,
  createPluginsDesktopController,
  removePluginBrowserItem,
  publishPrivatePluginSkill,
  pluginBrowserRemovalNotice,
  togglePluginServerTool,
  resyncPublishedPluginSkill,
  unpublishPublishedPluginSkill,
  updatePrivatePluginSkill,
  updateMarketplacePluginSetup,
  createPluginPrivateSkillSyncController,
  type PluginPrivateSkillEnableSource,
  type PluginPrivateSkillSyncController,
  type PluginPrivateSkillSyncSource
} from "./desktop";
import { PluginsDialogShell } from "./view";
import { publishSurfaceNotice, type PluginsNoticeEvent } from "../../../contracts/surface-notice";

export interface PluginsDesktopSurfaceProps {
  bridge: DesktopBridge;
  githubAuth?: PluginGitHubAuthBannerProps;
  activeAgentId?: string | null;
  privateSkillSource?: { getAgentWorkflows(agentId: string): Promise<unknown>; deleteAgentWorkflow(agentId: string, workflowId: string): Promise<unknown>; updateAgentWorkflow(agentId: string, workflowId: string, spec: Parameters<typeof updatePrivatePluginSkill>[3]): Promise<unknown>; getSkillPublishTargets(): Promise<unknown>; publishSkill(workflowId: string, teamId: string): Promise<unknown>; resyncPublishedSkill(workflowId: string): Promise<unknown>; unpublishSkill(workflowId: string): Promise<unknown> };
  /** Optional coordinator sync handoff; absent keeps plugin-skill sync fail-closed. */
  privateSkillSyncSource?: PluginPrivateSkillSyncSource;
  privateSkillEnableSource?: PluginPrivateSkillEnableSource;
  initialQuery?: string;
  isOpen: boolean;
  onClose(): void;
  onNotice?(event: PluginsNoticeEvent): void;
  onStatus?(status: string): void;
}

const EMPTY_PRIVATE_SKILL_ENABLE_SNAPSHOT = { status: "idle", skills: [], pendingWorkflowId: null, error: null } as const;
const EMPTY_PRIVATE_SKILL_ENABLE_SUBSCRIBE = () => () => {};
const readEmptyPrivateSkillEnableSnapshot = () => EMPTY_PRIVATE_SKILL_ENABLE_SNAPSHOT;
const EMPTY_PRIVATE_SKILL_SYNC_SNAPSHOT = { status: "idle", skills: [], pendingPluginId: null, added: null, error: null } as const;
const EMPTY_PRIVATE_SKILL_SYNC_SUBSCRIBE = () => () => {};
const readEmptyPrivateSkillSyncSnapshot = () => EMPTY_PRIVATE_SKILL_SYNC_SNAPSHOT;

export function PluginsDesktopSurface({ bridge, githubAuth, activeAgentId = null, privateSkillSource, privateSkillSyncSource, privateSkillEnableSource, initialQuery, isOpen, onClose, onNotice, onStatus }: PluginsDesktopSurfaceProps) {
  const [controller] = useState(() => createPluginsDesktopController(bridge));
  const controllerSnapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const snapshot = controllerSnapshot.data;
  const error = controllerSnapshot.failure == null ? null : controllerSnapshot.failure instanceof Error ? controllerSnapshot.failure.message : String(controllerSnapshot.failure);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const controllerBusyKey = controllerSnapshot.pendingKeys.at(-1) ?? null;
  const [privateSkills, setPrivateSkills] = useState<PluginPrivateSkill[]>([]);
  const [privateSkillsLoading, setPrivateSkillsLoading] = useState(false);
  const [privateSkillsError, setPrivateSkillsError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const privateSkillEnableController = useMemo(
    () => privateSkillEnableSource == null ? null : createPluginPrivateSkillEnableController(privateSkillEnableSource),
    [privateSkillEnableSource]
  );
  const privateSkillEnableSnapshot = useSyncExternalStore(
    privateSkillEnableController?.subscribe ?? EMPTY_PRIVATE_SKILL_ENABLE_SUBSCRIBE,
    privateSkillEnableController?.getSnapshot ?? readEmptyPrivateSkillEnableSnapshot,
    privateSkillEnableController?.getSnapshot ?? readEmptyPrivateSkillEnableSnapshot
  );
  const privateSkillSyncController = useMemo<PluginPrivateSkillSyncController | null>(
    () => privateSkillSyncSource == null ? null : createPluginPrivateSkillSyncController(privateSkillSyncSource),
    [privateSkillSyncSource]
  );
  const privateSkillSyncSnapshot = useSyncExternalStore(
    privateSkillSyncController?.subscribe ?? EMPTY_PRIVATE_SKILL_SYNC_SUBSCRIBE,
    privateSkillSyncController?.getSnapshot ?? readEmptyPrivateSkillSyncSnapshot,
    privateSkillSyncController?.getSnapshot ?? readEmptyPrivateSkillSyncSnapshot
  );

  const refresh = useCallback(async () => {
    return await controller.retry();
  }, [controller]);

  const load = useCallback(async () => {
    try {
      await refresh();
    } catch (reason) {
      if (!mountedRef.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      publishSurfaceNotice({ kind: "error", operation: "plugins-load", message }, onNotice, onStatus);
    }
  }, [onNotice, onStatus, refresh]);

  useEffect(() => {
    mountedRef.current = isOpen;
    if (isOpen) controller.open();
    else controller.close();
    return () => {
      mountedRef.current = false;
      controller.close();
    };
  }, [controller, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribeAuth = bridge.mcp.onAuthCompleted(() => { void controller.retry().catch(() => {}); });
    return unsubscribeAuth;
  }, [bridge, controller, isOpen]);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (!isOpen || privateSkillSource == null || activeAgentId == null) {
      setPrivateSkills([]);
      setPrivateSkillsLoading(false);
      setPrivateSkillsError(null);
      return;
    }
    let active = true;
    setPrivateSkillsLoading(true);
    setPrivateSkillsError(null);
    void privateSkillSource.getAgentWorkflows(activeAgentId).then((value) => {
      if (!active) return;
      setPrivateSkills(pluginPrivateSkillsFromCoordinator(value));
      setPrivateSkillsLoading(false);
    }, (reason) => {
      if (!active) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      setPrivateSkills([]);
      setPrivateSkillsLoading(false);
      setPrivateSkillsError(message);
      publishSurfaceNotice({ kind: "error", operation: "plugins-private-skills-load", message }, onNotice, onStatus);
    });
    return () => { active = false; };
  }, [activeAgentId, isOpen, onNotice, onStatus, privateSkillSource]);

  useEffect(() => {
    if (privateSkillSyncController == null) return;
    if (!isOpen || activeAgentId == null) {
      privateSkillSyncController.reset();
      return;
    }
    privateSkillSyncController.setScope(activeAgentId, privateSkills);
  }, [activeAgentId, isOpen, privateSkillSyncController, privateSkills]);

  useEffect(() => () => privateSkillSyncController?.dispose(), [privateSkillSyncController]);

  useEffect(() => {
    if (privateSkillEnableController == null) return;
    if (!isOpen || activeAgentId == null) {
      privateSkillEnableController.reset();
      return;
    }
    privateSkillEnableController.setScope(activeAgentId, privateSkills);
  }, [activeAgentId, isOpen, privateSkillEnableController, privateSkills]);

  useEffect(() => () => privateSkillEnableController?.dispose(), [privateSkillEnableController]);

  const deletePrivateSkill = useCallback(async (workflowId: string) => {
    if (activeAgentId == null || privateSkillSource == null) throw new Error("No active agent is available");
    const skillName = privateSkills.find((skill) => skill.id === workflowId)?.name ?? "skill";
    const nextSkills = await deletePrivatePluginSkill(privateSkillSource, activeAgentId, workflowId);
    if (mountedRef.current) {
      setPrivateSkills(nextSkills);
      publishSurfaceNotice({ kind: "success", operation: "plugins-private-skill-delete", message: pluginPrivateSkillDeletionNotice(skillName) }, onNotice, onStatus);
    }
  }, [activeAgentId, onNotice, onStatus, privateSkillSource, privateSkills]);

  const updatePrivateSkill = useCallback(async (workflowId: string, spec: Parameters<typeof updatePrivatePluginSkill>[3]) => {
    if (activeAgentId == null || privateSkillSource == null) throw new Error("No active agent is available");
    const nextSkills = await updatePrivatePluginSkill(privateSkillSource, activeAgentId, workflowId, spec);
    if (mountedRef.current) {
      setPrivateSkills(nextSkills);
      publishSurfaceNotice({ kind: "success", operation: "plugins-private-skill-update", message: `Saved ${spec.name}` }, onNotice, onStatus);
    }
  }, [activeAgentId, onNotice, onStatus, privateSkillSource]);

  const loadPrivatePublishTargets = useCallback(async (): Promise<PluginSkillPublishTargets> => {
    if (privateSkillSource == null) return { kind: "unavailable", reason: "No team is available to publish to." };
    return pluginSkillPublishTargetsFromCoordinator(await loadPrivateSkillPublishTargets(privateSkillSource));
  }, [privateSkillSource]);

  const publishPrivateSkill = useCallback(async (workflowId: string, teamId: string) => {
    if (activeAgentId == null || privateSkillSource == null) throw new Error("No active agent is available");
    const skillName = privateSkills.find((skill) => skill.id === workflowId)?.name ?? "skill";
    const result = await publishPrivatePluginSkill(privateSkillSource, workflowId, teamId);
    if (typeof result !== "object" || result == null || typeof (result as Record<string, unknown>).promotedWorkflowId !== "string") {
      throw new Error(`Published ${skillName}, but kept your private copy because the shared one has not arrived here yet. Edit the private copy until it does.`);
    }
    const nextSkills = await privateSkillSource.getAgentWorkflows(activeAgentId);
    if (mountedRef.current) setPrivateSkills(pluginPrivateSkillsFromCoordinator(nextSkills));
  }, [activeAgentId, privateSkillSource, privateSkills]);

  const resyncPrivateSkill = useCallback(async (workflowId: string) => {
    if (activeAgentId == null || privateSkillSource == null) throw new Error("No active agent is available");
    await resyncPublishedPluginSkill(privateSkillSource, workflowId);
    const nextSkills = await privateSkillSource.getAgentWorkflows(activeAgentId);
    if (mountedRef.current) setPrivateSkills(pluginPrivateSkillsFromCoordinator(nextSkills));
  }, [activeAgentId, privateSkillSource]);

  const unpublishPrivateSkill = useCallback(async (workflowId: string): Promise<string | null> => {
    if (activeAgentId == null || privateSkillSource == null) throw new Error("No active agent is available");
    const result = await unpublishPublishedPluginSkill(privateSkillSource, workflowId);
    const restoredWorkflowId = typeof result === "object" && result != null && typeof (result as Record<string, unknown>).restoredWorkflowId === "string"
      ? (result as Record<string, unknown>).restoredWorkflowId as string
      : null;
    const nextSkills = await privateSkillSource.getAgentWorkflows(activeAgentId);
    if (mountedRef.current) setPrivateSkills(pluginPrivateSkillsFromCoordinator(nextSkills));
    return restoredWorkflowId;
  }, [activeAgentId, privateSkillSource]);

  const togglePrivateSkill = useCallback(async (workflowId: string, isEnabled: boolean): Promise<void> => {
    if (privateSkillEnableController == null) return;
    const changed = await privateSkillEnableController.setEnabled(workflowId, isEnabled);
    if (!changed) {
      const current = privateSkillEnableController.getSnapshot();
      if (current.status === "failed") {
        const message = current.error instanceof Error ? current.error.message : String(current.error);
        publishSurfaceNotice({ kind: "error", operation: "plugins-private-skill-toggle", message }, onNotice, onStatus);
      }
    }
  }, [onNotice, onStatus, privateSkillEnableController]);

  const syncPrivateSkillsForPlugin = useCallback(async (pluginId: string, sourceRefs: readonly string[], reportFailure: boolean, displayName?: string): Promise<void> => {
    if (privateSkillSyncController == null || activeAgentId == null) return;
    const synced = await privateSkillSyncController.sync(pluginId, sourceRefs);
    const current = privateSkillSyncController.getSnapshot();
    if (!synced && current.status === "failed" && reportFailure) {
      const message = current.error instanceof Error ? current.error.message : String(current.error);
      publishSurfaceNotice({ kind: "error", operation: "plugins-private-skill-sync", message: displayName == null ? message : `Added ${displayName}, but its skills didn't sync: ${message}` }, onNotice, onStatus);
    }
    if (synced && mountedRef.current) setPrivateSkills([...current.skills]);
  }, [activeAgentId, onNotice, onStatus, privateSkillSyncController]);

  const run = async (key: string, operation: PluginsNoticeEvent["operation"], action: () => Promise<unknown>, rethrow = false) => {
    setBusyKey(key);
    try {
      await controller.execute(key, action);
    } catch (reason) {
      if (!mountedRef.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      publishSurfaceNotice({ kind: "error", operation, message }, onNotice, onStatus);
      if (rethrow) throw reason;
    } finally {
      if (mountedRef.current) setBusyKey(null);
    }
  };

  const authenticate = async (serverId: string, accountKey?: string) => {
    const result = await authenticatePluginBrowserServer(bridge, serverId, accountKey);
    const notice = pluginAuthenticationNotice(result);
    publishSurfaceNotice({ kind: notice.kind, operation: "plugins-authenticate", message: notice.text }, onNotice, onStatus);
    if (notice.kind === "error") throw new Error(notice.text);
    return result;
  };

  const removeBrowserItem = async (item: PluginBrowserItem) => {
    const result = await removePluginBrowserItem(bridge, item);
    if (item.kind === "plugin" && result.removed) {
      const refs = snapshot?.catalog.find((entry) => entry.id === item.id)?.skills.flatMap((skill) => skill.sourceUrl == null ? [] : [skill.sourceUrl]) ?? [];
      await syncPrivateSkillsForPlugin(item.id, refs, false).catch((reason) => {
        if (mountedRef.current) {
          const message = reason instanceof Error ? reason.message : String(reason);
          publishSurfaceNotice({ kind: "error", operation: "plugins-private-skill-sync", message }, onNotice, onStatus);
        }
      });
    }
    const notice = pluginBrowserRemovalNotice(item.displayName, result);
    publishSurfaceNotice({ kind: notice.kind, operation: "plugins-browser-remove", message: notice.text }, onNotice, onStatus);
  };

  if (snapshot == null) {
    return (
      <div aria-label="Plugins" aria-modal="true" className="sand-plugins-dialog" role="dialog">
        <button aria-label="Close" className="sand-plugins-dialog__close" onClick={onClose} type="button">×</button>
        <div aria-live="polite" role={error == null ? "status" : "alert"}>
          {error == null ? "Loading the marketplace…" : error}
          {error == null ? null : <button onClick={() => void load()} type="button">Retry</button>}
        </div>
      </div>
    );
  }

  const items = snapshot.items.map((item) => ({ ...item, busy: (busyKey ?? controllerBusyKey) === `${item.kind}:${item.id}` }));
  const synchronizedPrivateSkills = privateSkillSyncSnapshot.status === "ready" ? [...privateSkillSyncSnapshot.skills] : privateSkills;
  const privateSkillsForView = privateSkillEnableController == null || privateSkillEnableSnapshot.status === "idle"
    ? synchronizedPrivateSkills
    : [...privateSkillEnableSnapshot.skills];
  return (
    <PluginsDialogShell
      catalog={snapshot.catalog}
      githubAuth={githubAuth}
      initialQuery={initialQuery}
      isOpen={isOpen}
      items={items}
      privateSkills={privateSkillsForView}
      privateSkillsAgentId={activeAgentId}
      privateSkillsError={privateSkillsError}
      privateSkillsLoading={privateSkillsLoading}
      onDeletePrivateSkill={deletePrivateSkill}
      onUpdatePrivateSkill={updatePrivateSkill}
      onLoadPublishTargets={loadPrivatePublishTargets}
      onPublishPrivateSkill={publishPrivateSkill}
      onResyncPrivateSkill={resyncPrivateSkill}
      onUnpublishPrivateSkill={unpublishPrivateSkill}
      onTogglePrivateSkill={privateSkillEnableController == null ? undefined : togglePrivateSkill}
      privateSkillsTogglePendingId={privateSkillEnableSnapshot.status === "pending" ? privateSkillEnableSnapshot.pendingWorkflowId : null}
      onAuthenticate={(serverId, accountKey) => void run(`server:${serverId}:${accountKey ?? "default"}`, "plugins-authenticate", () => authenticate(serverId, accountKey))}
      onAddAccount={(serverId, label) => void run(`server:${serverId}:${label}`, "plugins-authenticate", () => authenticate(serverId, label))}
      onRenameAccount={(args) => void run(`server:${args.serverId}:${args.accountKey}`, "plugins-account-rename", async () => { await bridge.mcp.renameAccount(args); publishSurfaceNotice({ kind: "success", operation: "plugins-account-rename", message: pluginAccountRenameNotice(args.newAccountKey) }, onNotice, onStatus); })}
      onRemoveAccount={(args) => void run(`server:${args.serverId}:${args.accountKey}`, "plugins-account-remove", async () => { await bridge.mcp.removeAccount(args); publishSurfaceNotice({ kind: "success", operation: "plugins-account-remove", message: pluginAccountRemovalNotice(args.accountKey) }, onNotice, onStatus); })}
      onClose={onClose}
      onInstall={(pluginId, values, hasTeamConfiguredVariables) => run(`plugin:${pluginId}`, "plugins-install", async () => {
        await installMarketplacePlugin(bridge, pluginId, values, hasTeamConfiguredVariables);
        const refs = snapshot.catalog.find((entry) => entry.id === pluginId)?.skills.flatMap((skill) => skill.sourceUrl == null ? [] : [skill.sourceUrl]) ?? [];
        await syncPrivateSkillsForPlugin(pluginId, refs, true, snapshot.catalog.find((entry) => entry.id === pluginId)?.displayName);
      }, true)}
      onEditSetup={(pluginId, values) => run(`plugin:${pluginId}`, "plugins-edit-setup", () => updateMarketplacePluginSetup(bridge, pluginId, values), true)}
      onRemove={(item: PluginBrowserItem) => void run(`${item.kind}:${item.id}`, "plugins-remove", () => removeBrowserItem(item))}
      onLoadServerTools={(serverId) => listPluginServerTools(bridge, serverId)}
      onToggleServerTool={(serverId, toolName) => togglePluginServerTool(bridge, serverId, toolName)}
    />
  );
}
