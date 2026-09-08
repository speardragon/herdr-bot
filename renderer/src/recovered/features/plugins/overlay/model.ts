import type { EffectivePlugin, McpAuthenticationResult, McpServerSummary, McpToolSummary, PluginVariableField } from "../../../contracts/desktop-bridge";

export const DEFAULT_ACCOUNT_KEY = "default";

export interface PluginSkillSource {
  sourceUrl?: string | null;
}

export type PluginPrivateSkillSource = "workflow" | "managed" | "plugin";

export interface PluginWorkflowTrigger {
  schedule: string;
  isEnabled: boolean;
}

export interface PluginSkillPublishTarget {
  teamId: string;
  name: string;
}

export type PluginSkillPublishTargets =
  | { kind: "ready"; teams: PluginSkillPublishTarget[] }
  | { kind: "unavailable"; reason: string };

export interface PluginPrivateSkill {
  id: string;
  pluginId?: string;
  name: string;
  description: string;
  body: string;
  sourceRef: string | null;
  trigger: PluginWorkflowTrigger | null;
  source: PluginPrivateSkillSource;
  isEnabledForAgent: boolean;
}

export interface PluginAccount {
  accountKey: string;
}

export type PluginInstallMode = "user" | "team-default" | "team-required" | "unknown";

export type PluginSelection =
  | { kind: "plugin" | "setup"; entryId: string }
  | { kind: "installed"; serverId: string }
  | { kind: "workflow"; workflowId: string };

export function pluginSelectionKey(selection: PluginSelection): string {
  switch (selection.kind) {
    case "plugin":
    case "setup":
      return selection.entryId;
    case "installed":
      return selection.serverId;
    case "workflow":
      return selection.workflowId;
  }
}

export function skillSourceUrls(skill: PluginSkillSource): string[] {
  return skill.sourceUrl != null ? [skill.sourceUrl] : [];
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L983
export function togglePluginTool(tools: readonly McpToolSummary[], toolName: string): McpToolSummary[] {
  return tools.map((tool) => tool.name === toolName ? { ...tool, isDisabled: !tool.isDisabled } : tool);
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L384
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L802
export function pluginPrivateSkillsFromCoordinator(value: unknown): PluginPrivateSkill[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate == null || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    const source = record.source;
    const privateSource = source === "workflow" || source === "managed" || source === "plugin" ? source : null;
    if (privateSource == null || privateSource === "plugin" && record.publishedByCurrentUser !== true) return [];
    if (typeof record.id !== "string" || typeof record.name !== "string") return [];
    const triggerRecord = typeof record.trigger === "object" && record.trigger != null && !Array.isArray(record.trigger) ? record.trigger as Record<string, unknown> : null;
    const trigger = typeof triggerRecord?.schedule === "string" && typeof triggerRecord.isEnabled === "boolean"
      ? { schedule: triggerRecord.schedule, isEnabled: triggerRecord.isEnabled }
      : null;
    return [{
      id: record.id,
      ...(typeof record.pluginId === "string" ? { pluginId: record.pluginId } : {}),
      name: record.name,
      description: typeof record.description === "string" ? record.description : "",
      body: typeof record.body === "string" ? record.body : "",
      sourceRef: typeof record.sourceRef === "string" ? record.sourceRef : null,
      trigger,
      source: privateSource,
      isEnabledForAgent: record.isEnabledForAgent === true
    } satisfies PluginPrivateSkill];
  });
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1377
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1387
export function canUpdatePrivateSkill(skill: Pick<PluginPrivateSkill, "source" | "name" | "description" | "body">, draft: Pick<PluginPrivateSkill, "name" | "description" | "body">): boolean {
  return skill.source === "workflow"
    && draft.name.trim().length > 0
    && draft.description.trim().length > 0
    && draft.body.trim().length > 0
    && (draft.name !== skill.name || draft.description !== skill.description || draft.body !== skill.body);
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L770
export function pluginPrivateSkillSubtitle(skill: Pick<PluginPrivateSkill, "source" | "description">): string {
  return `${skill.source === "plugin" ? "Published" : "Created locally"} · ${skill.description.length > 0 ? skill.description : "Skill"}`;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1377
export function pluginPrivateSkillSourceLabel(skill: Pick<PluginPrivateSkill, "source">): string {
  if (skill.source === "managed") return "Managed by Cursor";
  if (skill.source === "plugin") return "Shared with your team";
  return "Private skill";
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L1240
export function pluginSkillPublishTargetsFromCoordinator(value: unknown): PluginSkillPublishTargets {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return { kind: "unavailable", reason: "No team is available to publish to." };
  const record = value as Record<string, unknown>;
  const teams = Array.isArray(record.teams) ? record.teams.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate == null || Array.isArray(candidate)) return [];
    const team = candidate as Record<string, unknown>;
    return typeof team.teamId === "string" && typeof team.name === "string" ? [{ teamId: team.teamId, name: team.name }] : [];
  }) : [];
  if (teams.length === 0) return { kind: "unavailable", reason: typeof record.unavailableReason === "string" ? record.unavailableReason : "No team is available to publish to." };
  return { kind: "ready", teams };
}

export function pluginInstallMode(value: EffectivePlugin | McpServerSummary | undefined): PluginInstallMode {
  if (value == null) return "user";
  if ("installMode" in value) return value.installMode;
  if (value.isRequired === true || value.managedByTeamPluginPolicy === true) return "team-required";
  return value.isTeamServer ? "team-required" : "user";
}

export function pluginTeamPolicyLabel(mode: PluginInstallMode): string | null {
  switch (mode) {
    case "team-required": return "Managed by your team";
    case "team-default": return "Added by your team";
    case "user":
    case "unknown": return null;
  }
}

export function pluginTeamPolicyActions(mode: PluginInstallMode): readonly ("remove" | "uninstall")[] {
  switch (mode) {
    case "team-required": return [];
    case "team-default": return ["remove"];
    case "user":
    case "unknown": return ["uninstall"];
  }
}

export function missingRequiredPluginFields(
  fields: readonly PluginVariableField[],
  values: Readonly<Record<string, string | undefined>>
): PluginVariableField[] {
  return fields.filter((field) => field.isRequired && (values[field.key] ?? field.defaultValue ?? "").trim().length === 0);
}

export function normalizePluginSetupValues(
  fields: readonly PluginVariableField[],
  values: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.key] ?? "").trim();
    if (value.length > 0) normalized[field.key] = value;
  }
  return normalized;
}

export function pluginAccountLabel(accountKey: string): string {
  return accountKey === DEFAULT_ACCOUNT_KEY ? "Default" : accountKey;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L839
export function pluginAccountAction(accounts: readonly PluginAccount[], rawLabel: string): "authenticate" | "add" | null {
  const label = rawLabel.trim();
  if (label.length === 0) return null;
  return accounts.some((account) => account.accountKey === label) ? "authenticate" : "add";
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L325
export function pluginAuthenticationNotice(result: McpAuthenticationResult): { kind: "success" | "error"; text: string } {
  switch (result.status) {
    case "already-authenticated": return { kind: "success", text: "Already authenticated" };
    case "not-configured": return { kind: "error", text: "Server is not configured" };
    case "not-supported": return { kind: "error", text: result.message };
    case "unreachable": return { kind: "error", text: `Couldn't start sign-in: ${result.message}` };
    case "started": return { kind: "success", text: "Opened the OAuth flow in your browser. Return here once it completes." };
  }
}

export function canRenamePluginAccount(server: McpServerSummary, account: PluginAccount): boolean {
  return server.url != null && account.accountKey !== DEFAULT_ACCOUNT_KEY;
}

export function groupPluginServerAccounts(servers: readonly McpServerSummary[]): Map<string, McpServerSummary[]> {
  const grouped = new Map<string, McpServerSummary[]>();
  for (const server of servers) {
    const key = server.rowServerIdentifier || server.id;
    const current = grouped.get(key);
    if (current == null) grouped.set(key, [server]);
    else current.push(server);
  }
  for (const accounts of grouped.values()) accounts.sort(compareDefaultAccountFirst);
  return grouped;
}

export function compareDefaultAccountFirst(left: PluginAccount, right: PluginAccount): number {
  return (left.accountKey === DEFAULT_ACCOUNT_KEY ? 0 : 1) - (right.accountKey === DEFAULT_ACCOUNT_KEY ? 0 : 1);
}

export function popPluginBreadcrumb<T>(breadcrumbs: readonly T[]): readonly T[] {
  return breadcrumbs.slice(0, -1);
}
