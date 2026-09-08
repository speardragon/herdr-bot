export const MAIN_RPC_EDGE = "main" as const;

export const MAIN_METHOD_TABLE = {
  openExternal: "object", submitFeedback: "object", getDesktopEnvironment: "none", getWindowState: "none",
  minimizeWindow: "none", toggleMaximizeWindow: "none", closeWindow: "none", resizeWindowWidth: "object",
  setTitleBarOverlayTone: "object", getThemeState: "none", setThemePreference: "object",
  getEgressTunnelEnabled: "none", setEgressTunnelEnabled: "object", getEgressTunnelStatus: "none",
  getWebauthnProxyEnabled: "none", setWebauthnProxyEnabled: "object", getUpdateStatus: "none",
  checkForUpdates: "none", setUpdateTrack: "object", quitAndInstallUpdate: "none", setAutoUpdateWhenIdleOptIn: "object",
  getBoxMigrationStatus: "none", markDeepLinksReady: "none", getOnboardingSeen: "none", setOnboardingSeen: "object",
  getTimeZone: "none", setTimeZoneOverride: "object", getAutoReviewInstructions: "none", setAutoReviewInstructions: "object",
  getLocalToolPermission: "none", getLocalToolPermissionCeiling: "none", setLocalToolPermission: "object",
  recordLocalToolApproval: "object", clearLocalToolApprovals: "none", getSidebarCollapsed: "none", setSidebarCollapsed: "object",
  pickAvatarSource: "none", pickAvatarFile: "none", generateAgentAvatarImage: "object", resolveAttachmentMedia: "object",
  readAttachmentText: "object", readAttachmentBytes: "object", stageAttachmentBytes: "object", downloadAttachment: "object",
  commitStagedAttachments: "object", discardStagedAttachment: "object", forceRecreateComputer: "none", updateComputer: "object",
  forceReconnectGateway: "none", getExperimentsSnapshot: "none", applyFeatureFlagOverride: "object", refreshFeatureFlags: "none",
  startRpcTraceWindow: "none", getAgentDefaultModel: "none", setAgentDefaultModel: "object", getComputerUseModel: "none",
  setComputerUseModel: "object", getHostPinnedAgents: "none", setHostPinnedAgents: "object", getHostSidebarSections: "none",
  setHostSidebarSections: "object", getAvailableModels: "none", transcribeAudio: "object", getCursorAuthStatus: "none",
  loginCursor: "none", cancelCursorLogin: "none", logoutCursor: "none", updateCursorAccountName: "object",
  getCursorAvatar: "none", getCursorWeeklyUsage: "none", getCursorUsageSummary: "none", getCursorPrReviewPreferences: "none",
  getCursorPrivacyModeEnabled: "none", getSandAccess: "none", getSandAccessFresh: "none", invokeCursorDashboardAction: "object",
  cancelCursorSandTrial: "none", reportAgentLoad: "object", reportAccessBlocked: "object", reportAgentsUnreachable: "object",
  reportRecoveryAction: "object", reportRebuildLifecycle: "object", reportReconciliation: "object", reportBoxVisibility: "object",
  reportSendLatency: "object", reportSendAck: "object", reportReactionAck: "object", reportRenderTtfr: "object",
  reportRenderStream: "object", reportVncSession: "object", reportVncLiveness: "object", reportOpenComputer: "object",
  reportUpdatePrompt: "object", reportSigninGate: "object", reportOnboardingStep: "object", reportClientFailure: "object",
  openCloudAgent: "object", getLinkMetadata: "object", listSecrets: "none", revealSecret: "object", upsertSecrets: "object",
  removeSecrets: "object", getMcpState: "none", getEffectivePlugins: "none", getMcpCatalog: "none", getMcpTeamPopularity: "none",
  getMcpPluginLogo: "object", installEntry: "object", updatePluginInstall: "object", removeMcpServer: "object",
  uninstallPlugin: "object", authenticateMcpServer: "object", renameMcpAccount: "object", removeMcpAccount: "object",
  setMcpCustomInstructions: "object", listMcpServerTools: "object", toggleMcpToolDisabled: "object"
} as const;

export type MainRpcMethod = keyof typeof MAIN_METHOD_TABLE;
export type MainRpcArgumentKind = (typeof MAIN_METHOD_TABLE)[MainRpcMethod];

export const MAIN_EVENTS = [
  "box-migration", "cursor-auth-changed", "deep-link", "dev-box-pull-progress", "dev-box-rebuild",
  "egress-tunnel-changed", "egress-tunnel-status-changed", "experiments-changed", "focus-agent", "force-onboarding", "open-about",
  "open-feedback", "skip-onboarding", "theme-changed", "update-status", "vnc-user-presence", "window-state",
  "webauthn-proxy-changed", "zoom-factor-changed"
] as const;

export type MainRpcEvent = (typeof MAIN_EVENTS)[number];

export interface KnownMainRpcArguments {
  openExternal: { url: string };
  openCloudAgent: { bcId: string };
  resolveAttachmentMedia: { source: string };
  readAttachmentText: { path: string };
  readAttachmentBytes: { path: string; maxBytes: number };
  downloadAttachment: { path: string; suggestedName?: string };
  stageAttachmentBytes: { filename: string; bytes: Uint8Array };
  commitStagedAttachments: { paths: string[]; filenames: string[] };
  discardStagedAttachment: { path: string };
  getLinkMetadata: { url: string };
  generateAgentAvatarImage: { description: string };
  transcribeAudio: { audio: Uint8Array; mimeType: string; language?: string };
  updateCursorAccountName: { name: string };
  setThemePreference: { preference: "system" | "light" | "dark" };
  setEgressTunnelEnabled: { enabled: boolean };
  setWebauthnProxyEnabled: { enabled: boolean };
  setOnboardingSeen: { seen: boolean };
  setTimeZoneOverride: { timeZone: string | null };
  setSidebarCollapsed: { collapsed: boolean };
  resizeWindowWidth: { deltaWidth: number };
  setTitleBarOverlayTone: { isOverlayTone: boolean };
  updateComputer: { id: string; force: boolean };
  setUpdateTrack: { track: "stable" | "nightly" | "dogfood" };
  setAutoUpdateWhenIdleOptIn: { enabled: boolean };
  removeMcpServer: { serverId: string };
  uninstallPlugin: { pluginId: string };
  listMcpServerTools: { serverId: string };
}

export type MainRpcArguments<Method extends MainRpcMethod> =
  Method extends keyof KnownMainRpcArguments
    ? KnownMainRpcArguments[Method]
    : (typeof MAIN_METHOD_TABLE)[Method] extends "none"
      ? undefined
      : Record<string, unknown>;

export type MainRpcClient = {
  [Method in MainRpcMethod]: (typeof MAIN_METHOD_TABLE)[Method] extends "none"
    ? () => Promise<unknown>
    : (args: MainRpcArguments<Method>) => Promise<unknown>;
};

export function mainMethodChannel(method: MainRpcMethod): `sand-rpc:main:m:${MainRpcMethod}` {
  return `sand-rpc:${MAIN_RPC_EDGE}:m:${method}`;
}

export function mainEventChannel(event: MainRpcEvent): `sand-rpc:main:e:${MainRpcEvent}` {
  return `sand-rpc:${MAIN_RPC_EDGE}:e:${event}`;
}
