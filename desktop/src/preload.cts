import { contextBridge, ipcRenderer, webFrame } from "electron";

type Listener = (payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();
ipcRenderer.on("herdr-bot:bridge-event", (_event, message: { event: string; payload: unknown }) => {
  for (const listener of [...(listeners.get(message.event) ?? [])]) listener(message.payload);
});

function on(event: string): (listener: Listener) => () => void {
  return (listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
    return () => { set.delete(listener); };
  };
}

function invoke(method: string, args: unknown = {}): Promise<unknown> {
  return ipcRenderer.invoke("herdr-bot:bridge", { method, args });
}

function sync(method: string): unknown {
  return ipcRenderer.sendSync("herdr-bot:bridge-sync", { method });
}

const noop = (): undefined => undefined;
const never = (name: string) => (): Promise<never> => Promise.reject(new Error(`${name} is not available in herdr-bot`));
const nothing = (): (() => void) => () => undefined;

const themeInitial = sync("getThemeState") as { preference: string; resolved: string };

const desktop = {
  resolveAttachmentMedia: (url: string) => invoke("resolveAttachmentMedia", { source: url }),
  readAttachmentText: (path: string) => invoke("readAttachmentText", { path }),
  readAttachmentBytes: (path: string, maxBytes: number) => invoke("readAttachmentBytes", { path, maxBytes }),
  downloadAttachment: (path: string, suggestedName?: string) => invoke("downloadAttachment", { path, suggestedName }),
  getLinkMetadata: (url: string) => invoke("getLinkMetadata", { url }),
  openExternal: (url: string) => invoke("openExternal", { url }),
  openCloudAgent: (bcId: string) => invoke("openCloudAgent", { bcId }),
  stageAttachmentBytes: (filename: string, bytes: Uint8Array) => invoke("stageAttachmentBytes", { filename, bytes }),
  commitStagedAttachments: (paths: readonly string[], filenames: readonly string[]) => invoke("commitStagedAttachments", { paths: [...paths], filenames: [...filenames] }),
  discardStagedAttachment: (path: string) => invoke("discardStagedAttachment", { path }),
  mcp: {
    list: () => invoke("mcpList"),
    effectivePlugins: () => invoke("mcpEffectivePlugins"),
    catalog: () => invoke("mcpCatalog"),
    teamPopularity: () => invoke("mcpTeamPopularity"),
    pluginLogo: (url: string) => invoke("mcpPluginLogo", { url }),
    install: never("mcp.install"), updatePluginInstall: never("mcp.updatePluginInstall"), remove: never("mcp.remove"), uninstallPlugin: never("mcp.uninstallPlugin"),
    authenticate: never("mcp.authenticate"), renameAccount: never("mcp.renameAccount"), removeAccount: never("mcp.removeAccount"), setCustomInstructions: never("mcp.setCustomInstructions"),
    listServerTools: async () => [], toggleToolDisabled: async () => [], onAuthCompleted: nothing(),
  },
  forceGatewayReconnect: () => invoke("forceReconnectGateway"),
  pickAvatarSource: () => invoke("pickAvatarSource"),
  pickAvatarFile: () => invoke("pickAvatarFile"),
  generateAgentAvatarImage: (description: string) => invoke("generateAgentAvatarImage", { description }),
  onFocusAgent: on("focus-agent"),
  onDeepLink: on("deep-link"),
  deepLinksReady: () => invoke("markDeepLinksReady"),
  getBoxMigrationStatus: () => invoke("getBoxMigrationStatus"),
  onBoxMigration: nothing(),
  onDevBoxRebuild: nothing(),
  onOpenFeedback: on("open-feedback"),
  onOpenAbout: on("open-about"),
  submitFeedback: (payload: unknown) => invoke("submitFeedback", { payload }),
  onWidgetGallery: nothing(),
  onForceOnboarding: on("force-onboarding"),
  transcribeAudio: never("transcribeAudio"),
  cursorAccount: {
    getStatus: () => invoke("getCursorAuthStatus"),
    login: () => invoke("loginCursor"), cancelLogin: () => invoke("cancelCursorLogin"), logout: () => invoke("logoutCursor"),
    updateName: (name: string) => invoke("updateCursorAccountName", { name }),
    getAvatar: () => invoke("getCursorAvatar"), getWeeklyUsage: () => invoke("getCursorWeeklyUsage"), getUsageSummary: () => invoke("getCursorUsageSummary"),
    getPrReviewPreferences: () => invoke("getCursorPrReviewPreferences"), getPrivacyModeEnabled: () => invoke("getCursorPrivacyModeEnabled"),
    getSandAccess: () => invoke("getSandAccess"), getSandAccessFresh: () => invoke("getSandAccessFresh"),
    invokeDashboardAction: (request: unknown) => invoke("invokeCursorDashboardAction", { request }), cancelTrial: () => invoke("cancelCursorSandTrial"),
    onStatusChanged: on("cursor-auth-changed"),
  },
  experiments: { initialSnapshot: {}, getSnapshot: () => invoke("getExperimentsSnapshot"), applyFeatureFlagOverride: () => invoke("applyFeatureFlagOverride"), refresh: () => invoke("refreshFeatureFlags"), startRpcTraceWindow: () => invoke("startRpcTraceWindow"), onChanged: nothing() },
  platform: process.platform,
  isDev: process.env.HERDR_BOT_DEV === "1",
  getWindowState: () => invoke("getWindowState"),
  onWindowStateEvent: on("window-state"),
  getZoomFactor: () => webFrame.getZoomFactor(),
  onZoomFactorEvent: on("zoom-factor-changed"),
  windowControls: {
    minimize: () => invoke("minimizeWindow"), toggleMaximize: () => invoke("toggleMaximizeWindow"), close: () => invoke("closeWindow"),
    setTitleBarOverlayTone: (isOverlayTone: boolean) => invoke("setTitleBarOverlayTone", { isOverlayTone }),
    resizeWidth: (deltaWidth: number) => invoke("resizeWindowWidth", { deltaWidth }),
  },
  foreverBox: {
    forceRecreate: () => invoke("forceRecreateComputer"), update: (id: string, force = false) => invoke("updateComputer", { id, force }),
    onVncUserPresence: nothing(), onDevBoxPullProgress: nothing(),
    egressTunnel: { initial: false, initialStatus: null, get: () => invoke("getEgressTunnelEnabled"), set: (enabled: boolean) => invoke("setEgressTunnelEnabled", { enabled }), onChanged: nothing(), getStatus: () => invoke("getEgressTunnelStatus"), onStatusChanged: nothing() },
    webauthnProxy: { initial: false, get: () => invoke("getWebauthnProxyEnabled"), set: (enabled: boolean) => invoke("setWebauthnProxyEnabled", { enabled }), onChanged: nothing() },
  },
  onboarding: { getSeen: () => invoke("getOnboardingSeen"), setSeen: (seen: boolean) => invoke("setOnboardingSeen", { seen }), onSkip: on("skip-onboarding") },
  telemetry: Object.fromEntries(["reportAgentLoad", "reportBoxVisibility", "reportSendLatency", "reportHeapMetrics", "reportSendAck", "reportReactionAck", "reportRenderTtfr", "reportRenderStream", "reportAgentsUnreachable", "reportAccessBlocked", "reportRecoveryAction", "reportRebuildLifecycle", "reportReconciliation", "reportVncSession", "reportVncLiveness", "reportOpenComputer", "reportUpdatePrompt", "reportSigninGate", "reportOnboardingStep", "reportClientFailure", "noteSentryConversation"].map((name) => [name, noop])),
  timeZone: { get: () => invoke("getTimeZone"), setOverride: (timeZone: string | null) => invoke("setTimeZoneOverride", { timeZone }) },
  autoReviewInstructions: { get: () => invoke("getAutoReviewInstructions"), set: (instructions: unknown) => invoke("setAutoReviewInstructions", instructions) },
  localToolPermission: {
    get: () => invoke("getLocalToolPermission"), set: (permission: unknown) => invoke("setLocalToolPermission", { permission }), ceiling: () => invoke("getLocalToolPermissionCeiling"),
    recordApproval: (approvalId: string, action: unknown, target: unknown) => invoke("recordLocalToolApproval", { approvalId, action, target }), clearApprovals: () => invoke("clearLocalToolApprovals"),
  },
  theme: { initial: themeInitial, get: () => invoke("getThemeState"), set: (preference: string) => invoke("setThemePreference", { preference }), onChanged: on("theme-changed") },
  secrets: { list: () => invoke("listSecrets"), reveal: (key: string) => invoke("revealSecret", { key }), upsert: (entries: unknown) => invoke("upsertSecrets", { entries }), remove: (keys: readonly string[]) => invoke("removeSecrets", { keys: [...keys] }) },
  agent: {
    getPinnedAgents: () => invoke("getHostPinnedAgents"), setPinnedAgents: (pinnedAgentIds: readonly string[]) => invoke("setHostPinnedAgents", { pinnedAgentIds: [...pinnedAgentIds] }),
    getSidebarSections: () => invoke("getHostSidebarSections"), setSidebarSections: (sections: readonly unknown[]) => invoke("setHostSidebarSections", { sections: [...sections] }),
    getDefaultModel: () => invoke("getAgentDefaultModel"), setDefaultModel: (model: unknown) => invoke("setAgentDefaultModel", { model }),
    getComputerUseModel: () => invoke("getComputerUseModel"), setComputerUseModel: (model: unknown) => invoke("setComputerUseModel", { model }),
    getAvailableModels: () => invoke("getAvailableModels"),
    clientPersistence: {
      read: (key: string) => invoke("persistenceRead", { key }), write: (key: string, value: string) => invoke("persistenceWrite", { key, value }),
      remove: (key: string) => invoke("persistenceRemove", { key }), listKeys: (prefix: string) => invoke("persistenceListKeys", { prefix }),
      migrateFromLocalStorage: (entries: readonly unknown[]) => invoke("persistenceMigrate", { entries: [...entries] }),
    },
  },
  update: { getStatus: () => invoke("getUpdateStatus"), check: () => invoke("checkForUpdates"), setTrack: () => invoke("getUpdateStatus"), quitAndInstall: async () => undefined, setAutoUpdateWhenIdleOptIn: () => invoke("getUpdateStatus"), onStatusEvent: on("update-status") },
  attachProdBox: { getStatus: async () => null, setEnabled: async () => null },
};

let portOwner: { onPort(port: unknown): void } | null = null;
ipcRenderer.on("herdr-bot:coordinator-port", (event) => {
  const port = event.ports[0];
  if (port == null || portOwner == null) return;
  const wrapped = {
    postMessage: (message: unknown) => port.postMessage(message),
    close: () => port.close(),
    start: () => port.start(),
    addEventListener: (type: "message" | "close", listener: (event: { data?: unknown }) => void) => {
      if (type === "message") port.addEventListener("message", (message: MessageEvent) => listener({ data: message.data }));
      else port.addEventListener("close", () => listener({}));
    },
  };
  portOwner.onPort(wrapped);
});

const coordinatorPort = {
  claim(consumer: { onPort(port: unknown): void }) {
    if (portOwner != null) return null;
    portOwner = consumer;
    return {
      request: () => { if (portOwner === consumer) ipcRenderer.send("herdr-bot:coordinator-port-request"); },
      release: () => { if (portOwner === consumer) portOwner = null; },
    };
  },
};

contextBridge.exposeInMainWorld("desktop", desktop);
contextBridge.exposeInMainWorld("coordinatorPort", coordinatorPort);
