import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { McpServerSummary, McpToolSummary, PluginVariableField } from "../../../contracts/desktop-bridge";
import { createPluginServerToolsController, type PluginServerToolsController } from "./server-tools";
import { createPluginPrivateSkillCopyController, pluginPrivateSkillMarketplaceUrl } from "./desktop";
import { PluginGitHubAuthBanner, type PluginGitHubAuthBannerProps } from "./github-auth-banner";
import { canRenamePluginAccount, canUpdatePrivateSkill, missingRequiredPluginFields, normalizePluginSetupValues, pluginAccountAction, pluginAccountLabel, pluginPrivateSkillSourceLabel, pluginPrivateSkillSubtitle, pluginTeamPolicyActions, pluginTeamPolicyLabel, togglePluginTool, type PluginInstallMode, type PluginPrivateSkill, type PluginSkillPublishTargets } from "./model";
import "./browser.css";

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L802

export type PluginBrowserTab = "marketplace" | "yours";
/** Retained for the recovered filter projection API. The production view uses the shipped two-axis filter below. */
export type PluginFilter = "all" | "installed" | "needs-attention";
export type PluginTypeFilter = "all" | "connectors" | "skills";
export type PluginOwnershipFilter = "all" | "team" | "public";
export interface PluginFilterState {
  type: PluginTypeFilter;
  ownership: PluginOwnershipFilter;
}

export type PluginBrowserItem =
  | {
      kind: "plugin";
      id: string;
      displayName: string;
      description: string;
      publisher?: string;
      installed: boolean;
      fields?: readonly PluginVariableField[];
      installMode?: PluginInstallMode;
      hasTeamConfiguredVariables?: boolean;
      busy?: boolean;
    }
  | {
      kind: "server";
      id: string;
      displayName: string;
      description: string;
      accountLabel?: string;
      accountSlots?: McpServerSummary[];
      policy?: PluginInstallMode;
      url?: string;
      status: "connected" | "authentication-required" | "initializing" | "disconnected" | "disabled-by-team-admin-policy" | "failed";
      busy?: boolean;
    }
  | {
      kind: "workflow";
      id: string;
      displayName: string;
      description: string;
      enabled: boolean;
      sourceUrl?: string;
      busy?: boolean;
    };

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=23255 (Hl applies the type/ownership filter to private skills)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=28963 (Windows private-skill filter projection)
export function filterPluginPrivateSkills(
  skills: readonly PluginPrivateSkill[],
  filter: PluginFilterState,
  query: string
): PluginPrivateSkill[] {
  const needle = query.trim().toLocaleLowerCase();
  return skills.filter((skill) => {
    if (filter.type === "connectors") return false;
    if (filter.ownership === "team" && skill.source !== "plugin") return false;
    if (filter.ownership === "public" && skill.source === "plugin") return false;
    return needle.length === 0 || `${skill.name} ${skill.description}`.toLocaleLowerCase().includes(needle);
  });
}

export interface PluginsBrowserProps {
  items: readonly PluginBrowserItem[];
  githubAuth?: PluginGitHubAuthBannerProps;
  catalog?: readonly {
    id: string;
    connectors: readonly unknown[];
    skills: readonly unknown[];
    fields?: readonly PluginVariableField[];
    marketplace?: { ownership: "team" | "user" };
  }[];
  privateSkills?: readonly PluginPrivateSkill[];
  privateSkillsAgentId?: string | null;
  privateSkillsLoading?: boolean;
  privateSkillsError?: string | null;
  onDeletePrivateSkill?(workflowId: string): Promise<void>;
  onUpdatePrivateSkill?(workflowId: string, spec: { name: string; description: string; body: string; trigger: PluginPrivateSkill["trigger"]; sourceRef: PluginPrivateSkill["sourceRef"] }): Promise<void>;
  onLoadPublishTargets?(): Promise<PluginSkillPublishTargets>;
  onPublishPrivateSkill?(workflowId: string, teamId: string): Promise<void>;
  onResyncPrivateSkill?(workflowId: string): Promise<void>;
  onUnpublishPrivateSkill?(workflowId: string): Promise<string | null>;
  // @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=44463 (Mac private row toggle)
  // @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=55241 (Windows private row toggle)
  onTogglePrivateSkill?(workflowId: string, isEnabled: boolean): Promise<void>;
  privateSkillsTogglePendingId?: string | null;
  initialQuery?: string;
  initialTab?: PluginBrowserTab;
  onAuthenticate?(serverId: string, accountKey?: string): void;
  onAddAccount?(serverId: string, label: string): void;
  onRenameAccount?(args: { serverId: string; accountKey: string; newAccountKey: string }): void;
  onRemoveAccount?(args: { serverId: string; accountKey: string }): void;
  onInstall?(pluginId: string, values?: Record<string, string>, hasTeamConfiguredVariables?: boolean): Promise<void> | void;
  onEditSetup?(pluginId: string, values: Record<string, string>): Promise<void> | void;
  onRemove?(item: PluginBrowserItem): void;
  onToggleWorkflow?(workflowId: string, enabled: boolean): void;
  onLoadServerTools?(serverId: string): Promise<McpToolSummary[]>;
  onToggleServerTool?(serverId: string, toolName: string): Promise<McpToolSummary[]>;
}

export function filterPluginItems(
  items: readonly PluginBrowserItem[],
  tab: PluginBrowserTab,
  filter: PluginFilter,
  query: string
): PluginBrowserItem[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const belongsToTab = tab === "marketplace" ? item.kind === "plugin" : item.kind !== "plugin" || item.installed;
    if (!belongsToTab) return false;
    if (filter === "installed" && !((item.kind === "plugin" && item.installed) || item.kind !== "plugin")) return false;
    if (filter === "needs-attention" && !(item.kind === "server" && item.status !== "connected")) return false;
    return needle.length === 0 || `${item.displayName} ${item.description}`.toLocaleLowerCase().includes(needle);
  });
}

export function PluginsBrowser({
  items,
  githubAuth,
  catalog = [],
  initialQuery = "",
  initialTab = "marketplace",
  onAuthenticate,
  onAddAccount,
  onRenameAccount,
  onRemoveAccount,
  onInstall,
  onEditSetup,
  onRemove,
  onToggleWorkflow,
  onLoadServerTools,
  onToggleServerTool,
  privateSkills = [],
  privateSkillsAgentId = null,
  privateSkillsLoading = false,
  privateSkillsError = null,
  onDeletePrivateSkill,
  onUpdatePrivateSkill,
  onLoadPublishTargets,
  onPublishPrivateSkill,
  onResyncPrivateSkill,
  onUnpublishPrivateSkill,
  onTogglePrivateSkill,
  privateSkillsTogglePendingId = null
}: PluginsBrowserProps) {
  const [tab, setTab] = useState<PluginBrowserTab>(initialTab);
  const [marketplaceFilter, setMarketplaceFilter] = useState<PluginFilterState>({ type: "all", ownership: "all" });
  const [yoursFilter, setYoursFilter] = useState<PluginFilterState>({ type: "all", ownership: "all" });
  const [query, setQuery] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPrivateSkillId, setSelectedPrivateSkillId] = useState<string | null>(null);
  const activeFilter = tab === "marketplace" ? marketplaceFilter : yoursFilter;
  const setActiveFilter = tab === "marketplace" ? setMarketplaceFilter : setYoursFilter;
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const belongsToTab = tab === "marketplace" ? item.kind === "plugin" : item.kind !== "plugin" || item.installed;
      if (!belongsToTab) return false;
      const facts = item.kind === "plugin" ? catalog.find((entry) => entry.id === item.id) : null;
      if (item.kind === "plugin" && activeFilter.type === "connectors" && (facts?.connectors.length ?? 0) === 0) return false;
      if (item.kind === "plugin" && activeFilter.type === "skills" && (facts?.skills.length ?? 0) === 0) return false;
      if (item.kind === "plugin" && activeFilter.ownership === "team" && facts?.marketplace?.ownership !== "team") return false;
      if (item.kind === "plugin" && activeFilter.ownership === "public" && facts?.marketplace?.ownership === "team") return false;
      return needle.length === 0 || `${item.displayName} ${item.description}`.toLocaleLowerCase().includes(needle);
    });
  }, [activeFilter, catalog, items, query, tab]);
  const selected = selectedId == null ? null : items.find((item) => `${item.kind}:${item.id}` === selectedId) ?? null;
  const visiblePrivateSkills = useMemo(() => filterPluginPrivateSkills(privateSkills, activeFilter, query), [activeFilter, privateSkills, query]);
  const privateFilterActive = activeFilter.type !== "all" || activeFilter.ownership !== "all";
  const selectedPrivateSkill = selectedPrivateSkillId == null ? null : privateSkills.find((skill) => skill.id === selectedPrivateSkillId) ?? null;

  if (selected != null) {
    return (
      <PluginDetail
        item={selected}
        onAuthenticate={onAuthenticate}
        onAddAccount={onAddAccount}
        onRenameAccount={onRenameAccount}
        onRemoveAccount={onRemoveAccount}
        onBack={() => setSelectedId(null)}
        onInstall={onInstall}
        onEditSetup={onEditSetup}
        onRemove={onRemove}
        onToggleWorkflow={onToggleWorkflow}
        onLoadServerTools={onLoadServerTools}
        onToggleServerTool={onToggleServerTool}
      />
    );
  }
  if (selectedPrivateSkill != null) {
    return <PluginSkillDetail onBack={() => setSelectedPrivateSkillId(null)} onDelete={selectedPrivateSkill.source === "workflow" && onDeletePrivateSkill != null ? () => onDeletePrivateSkill(selectedPrivateSkill.id) : undefined} onLoadPublishTargets={selectedPrivateSkill.source === "workflow" ? onLoadPublishTargets : undefined} onPublish={selectedPrivateSkill.source === "workflow" && onPublishPrivateSkill != null ? (teamId) => onPublishPrivateSkill(selectedPrivateSkill.id, teamId) : undefined} onResync={selectedPrivateSkill.source === "plugin" && selectedPrivateSkill.pluginId != null && onResyncPrivateSkill != null ? () => onResyncPrivateSkill(selectedPrivateSkill.id) : undefined} onUnpublish={selectedPrivateSkill.source === "plugin" && selectedPrivateSkill.pluginId != null && onUnpublishPrivateSkill != null ? async () => { const restoredWorkflowId = await onUnpublishPrivateSkill(selectedPrivateSkill.id); setSelectedPrivateSkillId(restoredWorkflowId); return restoredWorkflowId; } : undefined} onUpdate={selectedPrivateSkill.source === "workflow" && onUpdatePrivateSkill != null ? (spec) => onUpdatePrivateSkill(selectedPrivateSkill.id, spec) : undefined} skill={selectedPrivateSkill} />;
  }

  return (
    <div className="sand-plugins">
      <header>
        <h2 id="sand-plugins-modal-heading">Plugins</h2>
        <div aria-label="Plugins view" role="tablist">
          <button aria-selected={tab === "marketplace"} onClick={() => setTab("marketplace")} role="tab" type="button">Marketplace</button>
          <button aria-selected={tab === "yours"} onClick={() => setTab("yours")} role="tab" type="button">Yours</button>
        </div>
      </header>

      <div className="sand-plugins__bar">
        <PluginFilterMenu filter={activeFilter} onChange={setActiveFilter} />
        <label className="sand-plugins__search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Search plugins" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search plugins" spellCheck={false} type="search" value={query} />
        </label>
      </div>

      {githubAuth == null ? null : <PluginGitHubAuthBanner {...githubAuth} />}

      <div className="sand-plugins__grid">
        {visible.length === 0 ? <p>{emptyPluginsMessage(tab, query, activeFilter.type !== "all" || activeFilter.ownership !== "all")}</p> : visible.map((item) => (
          <button className="sand-plugins-row sand-plugins-row__open" key={`${item.kind}:${item.id}`} onClick={() => setSelectedId(`${item.kind}:${item.id}`)} type="button">
            <span aria-hidden="true">{item.kind === "plugin" ? "◇" : item.kind === "server" ? "⌁" : "⚡"}</span>
            <span className="sand-plugins-row__main">
              <strong className="sand-plugins-row__name">{item.displayName}</strong>
              <span className="sand-plugins-row__subtitle">{item.description}</span>
              <small>{pluginItemStatus(item)}</small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      {tab === "yours" && (!privateFilterActive || privateSkillsAgentId == null || visiblePrivateSkills.length > 0) ? <section aria-label="Private">
        <h3>Private</h3>
        {privateSkillsError != null ? <p role="alert">{privateSkillsError}</p> : privateSkillsAgentId == null ? <p>Open an agent to see its private skills</p> : privateSkillsLoading ? <p role="status" /> : visiblePrivateSkills.length === 0 ? <p>{query.trim().length > 0 ? `No private skills match "${query.trim()}"` : "No private skills yet. Ask your Bot to create one for you."}</p> : <div>
          {visiblePrivateSkills.map((skill) => <div className="sand-plugins-row" key={`private:${skill.id}`}>
            <span aria-hidden="true">▤</span>
            <button className="sand-plugins-row__open" onClick={() => setSelectedPrivateSkillId(skill.id)} type="button">
              <span className="sand-plugins-row__main"><strong className="sand-plugins-row__name">{skill.name}</strong><span className="sand-plugins-row__subtitle">{pluginPrivateSkillSubtitle(skill)}</span></span>
              <span aria-hidden="true">›</span>
            </button>
            {skill.source === "workflow" && onTogglePrivateSkill != null ? <button
              aria-checked={skill.isEnabledForAgent}
              aria-label={`Enable ${skill.name}`}
              disabled={privateSkillsTogglePendingId === skill.id}
              onClick={() => { void onTogglePrivateSkill(skill.id, !skill.isEnabledForAgent).catch(() => {}); }}
              role="switch"
              type="button"
            >{skill.isEnabledForAgent ? "On" : "Off"}</button> : null}
          </div>)}
        </div>}
      </section> : null}
    </div>
  );
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1374
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1463
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1389
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1248
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1317
export function PluginSkillDetail({ skill, onBack, onDelete, onUpdate, onLoadPublishTargets, onPublish, onResync, onUnpublish }: { skill: PluginPrivateSkill; onBack(): void; onDelete?(): Promise<void>; onUpdate?(spec: { name: string; description: string; body: string; trigger: PluginPrivateSkill["trigger"]; sourceRef: PluginPrivateSkill["sourceRef"] }): Promise<void>; onLoadPublishTargets?(): Promise<PluginSkillPublishTargets>; onPublish?(teamId: string): Promise<void>; onResync?(): Promise<void>; onUnpublish?(): Promise<string | null> }) {
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [body, setBody] = useState(skill.body);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [publishTargets, setPublishTargets] = useState<PluginSkillPublishTargets | null>(null);
  const [publishPending, setPublishPending] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncConfirmed, setSyncConfirmed] = useState(false);
  const [unpublishPending, setUnpublishPending] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  const [copyController] = useState(() => createPluginPrivateSkillCopyController({
    writeText: (value: string) => globalThis.navigator?.clipboard?.writeText(value) ?? Promise.reject(new Error("Clipboard unavailable"))
  }));
  const copyStatus = useSyncExternalStore(copyController.subscribe, copyController.getSnapshot, copyController.getSnapshot);
  const editable = skill.source === "workflow" && onUpdate != null;
  const canSave = editable && canUpdatePrivateSkill(skill, { name, description, body }) && !savePending && !deletePending;
  useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setBody(skill.body);
    setSaveError(null);
    setDeleteError(null);
    setPublishTargets(null);
    setPublishError(null);
    setSyncError(null);
    setSyncConfirmed(false);
    setUnpublishError(null);
  }, [skill]);
  useEffect(() => () => copyController.dispose(), [copyController]);
  useEffect(() => {
    if (!syncConfirmed) return;
    const timeout = setTimeout(() => setSyncConfirmed(false), 2000);
    return () => clearTimeout(timeout);
  }, [syncConfirmed]);
  const saveSkill = async () => {
    if (!canSave || onUpdate == null) return;
    setSaveError(null);
    setSavePending(true);
    try {
      await onUpdate({ name: name.trim(), description: description.trim(), body, trigger: skill.trigger, sourceRef: skill.sourceRef });
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavePending(false);
    }
  };
  const deleteSkill = async () => {
    if (onDelete == null || deletePending) return;
    setDeleteError(null);
    setDeletePending(true);
    try {
      await onDelete();
      onBack();
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDeletePending(false);
    }
  };
  const openPublish = async () => {
    if (onLoadPublishTargets == null || onPublish == null || publishPending) return;
    setPublishError(null);
    if (skill.description.trim().length === 0) {
      setPublishError("Add a description first");
      return;
    }
    setPublishTargets(null);
    setPublishPending(true);
    try {
      setPublishTargets(await onLoadPublishTargets());
    } catch (reason) {
      setPublishTargets({ kind: "unavailable", reason: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      setPublishPending(false);
    }
  };
  const publish = async (teamId: string) => {
    if (onPublish == null || publishPending) return;
    setPublishError(null);
    setPublishPending(true);
    try {
      await onPublish(teamId);
      setPublishTargets(null);
    } catch (reason) {
      setPublishError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPublishPending(false);
    }
  };
  const sync = async () => {
    if (onResync == null || syncPending) return;
    setSyncError(null);
    setSyncConfirmed(false);
    setSyncPending(true);
    try {
      await onResync();
      setSyncConfirmed(true);
    } catch (reason) {
      setSyncError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSyncPending(false);
    }
  };
  const unpublish = async () => {
    if (onUnpublish == null || unpublishPending) return;
    setUnpublishError(null);
    setUnpublishPending(true);
    try {
      await onUnpublish();
    } catch (reason) {
      setUnpublishError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUnpublishPending(false);
    }
  };
  const copyLink = () => {
    if (skill.source !== "plugin" || skill.pluginId == null) return;
    void copyController.copy(pluginPrivateSkillMarketplaceUrl(skill.pluginId));
  };
  const copyLabel = copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy link";
  return <article className="sand-plugins-skill-detail">
    <header>
      <button aria-label="Back" onClick={onBack} type="button">←</button>
      <div><h2>{skill.name}</h2><span>{pluginPrivateSkillSourceLabel(skill)}</span></div>
    </header>
    {skill.description.length > 0 ? <p>{skill.description}</p> : null}
    {onResync != null || onUnpublish != null || skill.source === "plugin" && skill.pluginId != null ? <div>{onResync != null ? <button disabled={savePending || deletePending || publishPending || syncPending || unpublishPending} onClick={() => void sync()} type="button">{syncPending ? "Syncing…" : syncConfirmed ? "Synced" : "Sync"}</button> : null}{skill.source === "plugin" && skill.pluginId != null ? <button onClick={copyLink} type="button">{copyLabel}</button> : null}{onUnpublish != null ? <button disabled={savePending || deletePending || publishPending || syncPending || unpublishPending} onClick={() => void unpublish()} type="button">{unpublishPending ? "Unpublishing…" : "Unpublish"}</button> : null}{syncError != null ? <p role="alert">{syncError}</p> : null}{unpublishError != null ? <p role="alert">{unpublishError}</p> : null}</div> : null}
    <div>
      <label>Name<input onChange={(event) => setName(event.currentTarget.value)} readOnly={!editable} spellCheck={false} type="text" value={name} /></label>
      <label>Description<input onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Use when…" readOnly={!editable} spellCheck={false} type="text" value={description} /></label>
      <label>Instructions<textarea onChange={(event) => setBody(event.currentTarget.value)} placeholder="Markdown instructions the agent follows when it runs this skill" readOnly={!editable} spellCheck={false} value={body} /></label>
    </div>
    {saveError != null ? <p role="alert">{saveError}</p> : null}
    {editable ? <button disabled={!canSave} onClick={() => void saveSkill()} type="button">Save</button> : null}
    {onPublish != null ? <div>
      <button disabled={savePending || deletePending || publishPending} onClick={() => void openPublish()} type="button">Publish</button>
      {publishTargets?.kind === "unavailable" ? <p role="alert">{publishTargets.reason}</p> : publishTargets?.kind === "ready" ? publishTargets.teams.length === 1 ? <div><p>All team members can view</p><button disabled={publishPending} onClick={() => void publish(publishTargets.teams[0].teamId)} type="button">Publish</button></div> : <div><h3>Publish to</h3>{publishTargets.teams.map((team) => <button disabled={publishPending} key={team.teamId} onClick={() => void publish(team.teamId)} type="button">{team.name}</button>)}</div> : publishPending ? <p role="status" /> : null}
      {publishError != null ? <p role="alert">{publishError}</p> : null}
    </div> : null}
    {deleteError != null ? <p role="alert">{deleteError}</p> : null}
    {onDelete != null ? <button disabled={deletePending} onClick={() => void deleteSkill()} type="button">Delete skill</button> : null}
  </article>;
}

function pluginItemStatus(item: PluginBrowserItem): string {
  if (item.kind === "plugin") return item.installed ? pluginTeamPolicyLabel(item.installMode ?? "user") ?? "Added" : item.publisher ?? "";
  if (item.kind === "workflow") return item.enabled ? "Enabled" : "Disabled";
  // @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L130049
  if (item.status === "disabled-by-team-admin-policy") return "Disabled by team admin";
  // @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L134674
  if (item.status === "authentication-required") return "Authentication required";
  // Immutable LBn status projection: connected/disconnected/error/initializing/needsAuth/disabledByTeamAdminPolicy.
  // @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
  if (item.status === "initializing") return "Starting";
  if (item.status === "disconnected") return "Disconnected";
  if (item.status === "failed") return "Error";
  return pluginTeamPolicyLabel(item.policy ?? "user") ?? (item.status === "connected" ? item.accountLabel ?? "Connected" : "Needs attention");
}

function emptyPluginsMessage(tab: PluginBrowserTab, query: string, isFilterActive: boolean): string {
  if (isFilterActive) return "No plugins match the current filters";
  const trimmed = query.trim();
  if (tab === "marketplace") return trimmed.length > 0 ? `No plugins match "${trimmed}"` : "The marketplace isn't available right now. Check back later.";
  return trimmed.length > 0 ? `No installed plugins match "${trimmed}"` : "Nothing installed yet. Find plugins in the Marketplace tab.";
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L510
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L525
export function PluginFilterMenu({ filter, onChange }: { filter: PluginFilterState; onChange(next: PluginFilterState): void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = filter.type !== "all" || filter.ownership !== "all";
  const select = (next: Partial<PluginFilterState>) => onChange({ ...filter, ...next });
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const options: HTMLButtonElement[] = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]"));
    if (options.length === 0) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    options[next]?.focus();
  };
  return <div>
    <button aria-expanded={open} aria-haspopup="menu" aria-label="Filter plugins" aria-pressed={active} onClick={() => setOpen((value) => !value)} ref={triggerRef} type="button">Filter</button>
    {open ? <div aria-label="Filter plugins" onKeyDown={onMenuKeyDown} role="menu">
      <div role="group">
        <h3>Type</h3>
        {([[
          "all", "All types"
        ], ["connectors", "Connectors"], ["skills", "Skills"]] as const).map(([value, label]) => <button aria-checked={filter.type === value} onClick={() => select({ type: value })} role="menuitemradio" key={value} type="button">{filter.type === value ? "✓ " : ""}{label}</button>)}
      </div>
      <div role="group">
        <h3>Ownership</h3>
        {([[
          "all", "All"
        ], ["team", "Team"], ["public", "Public"]] as const).map(([value, label]) => <button aria-checked={filter.ownership === value} onClick={() => select({ ownership: value })} role="menuitemradio" key={value} type="button">{filter.ownership === value ? "✓ " : ""}{label}</button>)}
      </div>
    </div> : null}
  </div>;
}

function PluginDetail({
  item,
  onBack,
  onAuthenticate,
  onAddAccount,
  onRenameAccount,
  onRemoveAccount,
  onInstall,
  onEditSetup,
  onRemove,
  onToggleWorkflow,
  onLoadServerTools,
  onToggleServerTool
}: {
  item: PluginBrowserItem;
  onBack(): void;
  onAuthenticate?: PluginsBrowserProps["onAuthenticate"];
  onAddAccount?: PluginsBrowserProps["onAddAccount"];
  onRenameAccount?: PluginsBrowserProps["onRenameAccount"];
  onRemoveAccount?: PluginsBrowserProps["onRemoveAccount"];
  onInstall?: PluginsBrowserProps["onInstall"];
  onEditSetup?: PluginsBrowserProps["onEditSetup"];
  onRemove?: PluginsBrowserProps["onRemove"];
  onToggleWorkflow?: PluginsBrowserProps["onToggleWorkflow"];
  onLoadServerTools?: PluginsBrowserProps["onLoadServerTools"];
  onToggleServerTool?: PluginsBrowserProps["onToggleServerTool"];
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const fields = item.kind === "plugin" ? item.fields ?? [] : [];
  if (setupOpen && item.kind === "plugin") {
    return <PluginSetupForm
      fields={fields}
      initialValues={{}}
      intro={item.installed ? "Saving replaces all of this plugin's setup values and applies them to its connectors. Current values aren't shown; a field left blank is cleared." : `${item.displayName} needs a few values before it can be added`}
      isBusy={item.busy === true}
      onSubmit={async (values) => {
        if (item.installed) await onEditSetup?.(item.id, values);
        else await onInstall?.(item.id, values);
        setSetupOpen(false);
      }}
      submitLabel={item.installed ? "Save Values" : `Add ${item.displayName}`}
    />;
  }
  return (
    <article className="sand-plugins-detail">
      <header>
        <button aria-label="Back" onClick={onBack} type="button">←</button>
        <div><h2>{item.displayName}</h2><small>{pluginItemStatus(item)}</small></div>
      </header>
      <p>{item.description}</p>
      <div>
        {item.kind === "plugin" && !item.installed ? <button disabled={item.busy} onClick={() => fields.length > 0 && item.hasTeamConfiguredVariables !== true ? setSetupOpen(true) : onInstall?.(item.id, undefined, item.hasTeamConfiguredVariables)} type="button">Add</button> : null}
        {item.kind === "server" && item.status === "authentication-required" ? <button disabled={item.busy} onClick={() => onAuthenticate?.(item.id, item.accountSlots?.[0]?.accountKey ?? item.accountLabel)} type="button">Authenticate</button> : null}
        {item.kind === "workflow" && onToggleWorkflow != null ? <button disabled={item.busy} onClick={() => onToggleWorkflow(item.id, !item.enabled)} type="button">{item.enabled ? "Disable" : "Enable"}</button> : null}
        {item.kind === "plugin" && item.installed && pluginTeamPolicyActions(item.installMode ?? "user").length > 0 ? <button disabled={item.busy} onClick={() => onRemove?.(item)} type="button">{item.installMode === "team-default" ? "Remove" : "Uninstall"}</button> : null}
        {item.kind === "server" && item.status !== "disabled-by-team-admin-policy" && pluginTeamPolicyActions(item.policy ?? "user").length > 0 ? <button disabled={item.busy} onClick={() => onRemove?.(item)} type="button">Remove</button> : null}
      </div>
      {item.kind === "plugin" && item.installed && fields.length > 0 ? <button disabled={item.busy} onClick={() => setSetupOpen(true)} type="button">Edit Values</button> : null}
      {item.kind === "server" ? <AccountManager item={item} disabled={item.busy === true} onAuthenticate={onAuthenticate} onAddAccount={onAddAccount} onRenameAccount={onRenameAccount} onRemoveAccount={onRemoveAccount} /> : null}
      {item.kind === "server" && onLoadServerTools != null && onToggleServerTool != null ? <PluginServerTools key={item.id} serverId={item.id} onLoad={onLoadServerTools} onToggle={onToggleServerTool} /> : null}
    </article>
  );
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L918
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L953
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L971
export function pluginToolSummary(enabledCount: number, totalCount: number): string {
  return `${enabledCount} of ${totalCount} enabled`;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=31735 (status badge keeps enum in data-status and exposes statusDetail as title)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=39211 (Windows status badge projection)
export function PluginAccountStatus({ account }: { account: McpServerSummary }) {
  const label = pluginAccountStatusLabel(account.status);
  return <span data-status={account.status} role="status" title={account.statusDetail ?? undefined}>{label}</span>;
}

export function pluginAccountStatusLabel(status: McpServerSummary["status"]): string {
  switch (status) {
    case "connected": return "Connected";
    case "needsAuth": return "Authentication required";
    case "initializing": return "Starting";
    case "disconnected": return "Disconnected";
    case "disabledByTeamAdminPolicy": return "Disabled by team admin";
    case "error": return "Error";
  }
}

export function PluginServerTools({ serverId, onLoad, onToggle }: { serverId: string; onLoad(serverId: string): Promise<McpToolSummary[]>; onToggle(serverId: string, toolName: string): Promise<McpToolSummary[]> }) {
  const [controller] = useState<PluginServerToolsController>(() => createPluginServerToolsController(
    () => onLoad(serverId),
    (toolName) => onToggle(serverId, toolName)
  ));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const tools = snapshot.tools;
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  useEffect(() => {
    controller.open();
    return () => controller.dispose();
  }, [controller]);

  if (tools.length === 0) return null;

  const enabledTools = tools.filter((tool) => !tool.isDisabled);
  const summary = pluginToolSummary(enabledTools.length, tools.length);
  return <section aria-label="Tools">
    <button aria-controls={detailsId} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} type="button">Tools <span>{summary}</span>⌄</button>
    {expanded ? <div id={detailsId}>
      {snapshot.status === "loading" ? <p role="status" /> : null}
      {snapshot.failure != null ? <p role="alert">{snapshot.failure instanceof Error ? snapshot.failure.message : String(snapshot.failure)}</p> : null}
      {tools.map((tool) => {
        const label = tool.title ?? tool.name;
        const action = tool.isDisabled ? "Enable" : "Disable";
        return <button aria-label={`${action} ${label}`} disabled={snapshot.pendingTool != null} key={tool.name} onClick={() => void controller.toggle(tool.name).catch(() => {})} title={tool.description ?? undefined} type="button">{action} {label}</button>;
      })}
    </div> : null}
  </section>;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1205
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1614
export function PluginSetupForm({ intro, fields, initialValues, submitLabel, isBusy, onSubmit }: {
  intro: string;
  fields: readonly PluginVariableField[];
  initialValues: Record<string, string>;
  submitLabel: string;
  isBusy: boolean;
  onSubmit(values: Record<string, string>): Promise<void>;
}) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.key, initialValues[field.key] ?? field.defaultValue ?? ""])));
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = missingRequiredPluginFields(fields, values);
  return <form className="sand-plugin-setup" onSubmit={(event) => {
    event.preventDefault();
    if (missing.length > 0) { setSubmitted(true); return; }
    setError(null);
    setPending(true);
    void onSubmit(normalizePluginSetupValues(fields, values)).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => setPending(false));
  }}>
    <p>{intro}</p>
    <div>
      {fields.map((field) => {
        const invalid = submitted && missing.some((missingField) => missingField.key === field.key);
        return <div key={field.key}>
          <label htmlFor={`plugin-${field.key}`}>{field.label}{field.isRequired ? null : " (optional)"}</label>
          <input aria-invalid={invalid || undefined} id={`plugin-${field.key}`} onChange={(event) => { const nextValue = event.currentTarget.value; setValues((current) => ({ ...current, [field.key]: nextValue })); }} placeholder={field.placeholder ?? field.key} type={field.isSecret ? "password" : "text"} value={values[field.key] ?? ""} />
          {invalid ? <p>{field.label} is required</p> : !invalid && field.hint != null ? <p>{field.hint}</p> : null}
        </div>;
      })}
    </div>
    {missing.length > 0 && submitted ? <span>Fill in the required {missing.length === 1 ? "field" : "fields"} to continue</span> : null}
    {error != null ? <p role="alert">{error}</p> : null}
    <button disabled={isBusy || pending} type="submit">{submitLabel}</button>
  </form>;
}

function AccountManager({
  item,
  disabled,
  onAuthenticate,
  onAddAccount,
  onRenameAccount,
  onRemoveAccount
}: {
  item: Extract<PluginBrowserItem, { kind: "server" }>;
  disabled: boolean;
  onAuthenticate?: PluginsBrowserProps["onAuthenticate"];
  onAddAccount?: PluginsBrowserProps["onAddAccount"];
  onRenameAccount?: PluginsBrowserProps["onRenameAccount"];
  onRemoveAccount?: PluginsBrowserProps["onRemoveAccount"];
}) {
  const accounts: readonly McpServerSummary[] = item.accountSlots ?? [{
    id: item.id,
    name: item.displayName,
    serverIdentifier: item.id,
    accountKey: item.accountLabel ?? "default",
    rowServerIdentifier: item.id,
    transport: "http",
    toolCount: 0,
    customInstructions: "",
    isTeamServer: false,
    status: item.status === "authentication-required" ? "needsAuth" : item.status === "connected" ? "connected" : "error"
  }];
  const [editing, setEditing] = useState<{ accountKey: string; draft: string; confirming: boolean } | null>(null);
  const [newLabel, setNewLabel] = useState<string | null>(null);
  const submitRename = () => {
    if (editing == null) return;
    const next = editing.draft.trim();
    setEditing(null);
    if (next.length > 0 && next !== editing.accountKey) onRenameAccount?.({ serverId: item.id, accountKey: editing.accountKey, newAccountKey: next });
  };
  const submitAdd = () => {
    const label = newLabel?.trim() ?? "";
    const action = pluginAccountAction(accounts, label);
    setNewLabel(null);
    if (action === "authenticate") onAuthenticate?.(item.id, label);
    if (action === "add") onAddAccount?.(item.id, label);
  };
  if (accounts.length === 0) return null;
  return (
    <section aria-label="Accounts">
      <h3>Accounts</h3>
      {accounts.map((account) => {
        const canRename = canRenamePluginAccount(account, account);
        const active = editing?.accountKey === account.accountKey;
        return <div key={account.serverIdentifier}>
          {active ? <input aria-label={`Rename ${pluginAccountLabel(account.accountKey)} account`} onChange={(event) => { const nextDraft = event.currentTarget.value; setEditing((current) => current == null ? current : { ...current, draft: nextDraft }); }} onKeyDown={(event) => { if (event.key === "Enter") submitRename(); if (event.key === "Escape") setEditing(null); }} type="text" value={editing?.draft ?? ""} /> : <span>{pluginAccountLabel(account.accountKey)}</span>}
          {canRename ? <button aria-label={active ? `Save ${pluginAccountLabel(account.accountKey)} account` : `Edit ${pluginAccountLabel(account.accountKey)} account`} disabled={disabled} onClick={() => active ? submitRename() : setEditing({ accountKey: account.accountKey, draft: account.accountKey, confirming: false })} type="button">{active ? "✓" : "Edit"}</button> : null}
          <PluginAccountStatus account={account} />
          {account.status === "error" && account.statusDetail != null ? <span role="alert">{account.statusDetail}</span> : null}
          {account.status === "needsAuth" ? <button disabled={disabled} onClick={() => onAuthenticate?.(account.id, account.accountKey)} type="button">Authenticate</button> : null}
          {canRename && account.accountKey !== "default" ? editing?.accountKey === account.accountKey && editing.confirming ? <button disabled={disabled} onClick={() => { setEditing(null); onRemoveAccount?.({ serverId: account.id, accountKey: account.accountKey }); }} type="button">Confirm Remove</button> : <button disabled={disabled} onClick={() => setEditing({ accountKey: account.accountKey, draft: account.accountKey, confirming: true })} type="button">Remove</button> : null}
        </div>;
      })}
      {item.url == null ? null : newLabel == null ? <button disabled={disabled} onClick={() => setNewLabel("")} type="button">Add Another Account</button> : <div><input aria-label="New account label" autoFocus onChange={(event) => setNewLabel(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") submitAdd(); if (event.key === "Escape") setNewLabel(null); }} placeholder="Label this account, e.g. work or personal" type="text" value={newLabel} /><button disabled={disabled} onClick={submitAdd} type="button">Authorize</button><button onClick={() => setNewLabel(null)} type="button">Cancel</button></div>}
    </section>
  );
}
