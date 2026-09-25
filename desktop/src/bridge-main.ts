import type { BrowserWindow, Dialog, IpcMain, NativeTheme, Shell } from "electron";
import type { Host } from "../../core/src/host.ts";
import { log } from "../../core/src/log.ts";
import type { SettingsStore } from "./settings-store.ts";
import { createAttachmentService, type AttachmentService } from "./attachments.ts";
import { isNewerVersion } from "./version-check.ts";

export interface BridgeDeps {
  readonly ipcMain: IpcMain;
  readonly window: BrowserWindow;
  readonly settings: SettingsStore;
  readonly host: Host;
  readonly nativeTheme: NativeTheme;
  readonly shell: Shell;
  readonly dialog: Dialog;
  readonly appVersion: string;
  readonly userDataDir: string;
  readonly userName: string;
}

type ThemePreference = "system" | "light" | "dark";
type Handler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function themeState(settings: SettingsStore, nativeTheme: NativeTheme): { preference: ThemePreference; resolved: "light" | "dark" } {
  const preference = settings.get<ThemePreference>("theme.preference", "system");
  const resolved = preference === "system" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : preference;
  return { preference, resolved };
}

// herdr-bot: no code-signing certificate, so there is no silent background download/install --
// Squirrel.Mac in particular refuses to run against an unsigned build, and an unsigned Windows
// installer would just trade that failure for an unverifiable one. "Check for Updates" instead
// compares the running version against the latest GitHub release tag; when one is newer, the
// settings panel's action opens that release's page so the user downloads and installs it
// themselves (release/version-check.ts has the pure comparison, GitHub-tag-suffix handling
// included). "Update Track" and "Auto-update when idle" have no effect either way (there is only
// ever one build), so their gates below stay off and the settings panel hides the track picker.
const UPDATE_CHECK_REPO = "speardragon/herdr-bot";

function updateStatus(appVersion: string, state: unknown): unknown {
  return {
    state,
    currentVersion: appVersion, currentTrack: "stable", trackOverride: null, buildDefaultTrack: "stable", availableTracks: ["stable"],
    isTrackManagedByPolicy: false, isBelowMinimumVersion: false, autoUpdateWhenIdleOptIn: false, autoUpdateWhenIdleGateEnabled: false,
  };
}

async function fetchLatestRelease(): Promise<{ readonly tag: string; readonly url: string } | null> {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_CHECK_REPO}/releases/latest`, {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null; // no release published yet
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const body = await response.json() as { tag_name?: unknown; html_url?: unknown };
  if (typeof body.tag_name !== "string" || body.tag_name.length === 0) return null;
  return { tag: body.tag_name, url: typeof body.html_url === "string" ? body.html_url : `https://github.com/${UPDATE_CHECK_REPO}/releases` };
}

async function checkForAppUpdate(appVersion: string): Promise<unknown> {
  const now = Date.now();
  try {
    const release = await fetchLatestRelease();
    if (release != null && isNewerVersion(appVersion, release.tag)) {
      return updateStatus(appVersion, { type: "available", version: release.tag.replace(/^v/i, ""), releaseUrl: release.url });
    }
    return updateStatus(appVersion, { type: "idle", lastCheck: { at: now, result: "up-to-date" } });
  } catch (error) {
    return updateStatus(appVersion, { type: "idle", lastCheck: { at: now, result: "error", errorMessage: error instanceof Error ? error.message : String(error) } });
  }
}

export function createBridgeHandlers(deps: BridgeDeps, attachments: AttachmentService): Record<string, Handler> {
  const { settings, window, nativeTheme, shell } = deps;
  const push = (event: string, payload: unknown): void => {
    if (!window.isDestroyed()) window.webContents.send("herdr-bot:bridge-event", { event, payload });
  };
  const windowState = () => ({ isFullscreen: window.isFullScreen(), isMaximized: window.isMaximized() });
  const account = { kind: "logged-in", displayName: deps.userName, email: undefined, isAnysphereUser: false };
  const granted = { state: "granted", reason: "none" };
  // herdr-bot: getUpdateStatus returns the last check's result (so re-opening Settings doesn't
  // re-hit the network); checkForUpdates is the one that actually performs it.
  let lastUpdateStatus: unknown = updateStatus(deps.appVersion, { type: "idle" });

  return {
    // shell / window
    openExternal: async ({ url }) => { if (typeof url === "string" && /^https?:\/\//.test(url)) await shell.openExternal(url); },
    getWindowState: () => windowState(),
    minimizeWindow: () => { window.minimize(); },
    toggleMaximizeWindow: () => { if (window.isMaximized()) window.unmaximize(); else window.maximize(); },
    closeWindow: () => { window.close(); },
    setTitleBarOverlayTone: () => undefined,
    resizeWindowWidth: ({ deltaWidth }) => { const size = window.getSize(); const w = size[0] ?? 0; const h = size[1] ?? 0; const next = Math.max(512, w + (typeof deltaWidth === "number" ? deltaWidth : 0)); window.setSize(next, h); return next; },
    getZoomFactor: () => window.webContents.getZoomFactor(),
    // theme
    getThemeState: () => themeState(settings, nativeTheme),
    setThemePreference: ({ preference }) => {
      if (preference === "system" || preference === "light" || preference === "dark") { settings.set("theme.preference", preference); nativeTheme.themeSource = preference; }
      const state = themeState(settings, nativeTheme); push("theme-changed", state); return state;
    },
    // account & access gates
    getCursorAuthStatus: () => account,
    getSandAccess: () => granted,
    getSandAccessFresh: () => granted,
    getCursorUsageSummary: () => null,
    getCursorAvatar: () => null,
    getCursorWeeklyUsage: () => null,
    getCursorPrReviewPreferences: () => null,
    getCursorPrivacyModeEnabled: () => false,
    // updates / onboarding / misc state
    getUpdateStatus: () => lastUpdateStatus,
    // herdr-bot: pushed too, not just returned -- the command palette's "Check for Updates" entry
    // reads a separate controller that only ever learns of a new status via this event (it does not
    // see this call's return value), so without the push it would still say "Check for Updates"
    // after an update was actually found, until the app restarted.
    checkForUpdates: async () => { lastUpdateStatus = await checkForAppUpdate(deps.appVersion); push("update-status", lastUpdateStatus); return lastUpdateStatus; },
    getOnboardingSeen: () => settings.get("onboarding.seen", true),
    setOnboardingSeen: ({ seen }) => { settings.set("onboarding.seen", seen === true); },
    getBoxMigrationStatus: () => null,
    markDeepLinksReady: () => undefined,
    getTimeZone: () => ({ detectedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, overrideTimeZone: settings.get<string | null>("timezone.override", null) }),
    setTimeZoneOverride: ({ timeZone }) => { settings.set("timezone.override", typeof timeZone === "string" ? timeZone : null); return { detectedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, overrideTimeZone: settings.get<string | null>("timezone.override", null) }; },
    getAutoReviewInstructions: () => settings.get("autoReview", { isEnabled: false, allowInstructions: [], blockInstructions: [] }),
    setAutoReviewInstructions: (args) => { settings.set("autoReview", args); return args; },
    getLocalToolPermission: () => "ask",
    getLocalToolPermissionCeiling: () => "always",
    setLocalToolPermission: ({ permission }) => permission,
    recordLocalToolApproval: () => undefined,
    clearLocalToolApprovals: () => undefined,
    getSidebarCollapsed: () => settings.get("sidebar.collapsed", false),
    setSidebarCollapsed: ({ collapsed }) => { settings.set("sidebar.collapsed", collapsed === true); },
    getHostPinnedAgents: () => settings.get<string[] | null>("pinnedAgents", null),
    setHostPinnedAgents: ({ pinnedAgentIds }) => { const ids = Array.isArray(pinnedAgentIds) ? pinnedAgentIds.filter((id): id is string => typeof id === "string") : []; settings.set("pinnedAgents", ids); return ids; },
    getHostSidebarSections: () => settings.get<unknown[] | null>("sidebarSections", null),
    setHostSidebarSections: ({ sections }) => { settings.set("sidebarSections", Array.isArray(sections) ? sections : []); return Array.isArray(sections) ? sections : []; },
    getAgentDefaultModel: () => null,
    setAgentDefaultModel: ({ model }) => model ?? null,
    getComputerUseModel: () => null,
    setComputerUseModel: () => null,
    getAvailableModels: () => ({ models: [] }),
    // client persistence (renderer-owned slices such as composer drafts)
    persistenceRead: ({ key }) => settings.get<string | null>(`persist:${String(key)}`, null),
    persistenceWrite: ({ key, value }) => { settings.set(`persist:${String(key)}`, String(value)); },
    persistenceRemove: ({ key }) => { settings.remove(`persist:${String(key)}`); },
    persistenceListKeys: ({ prefix }) => settings.keys(`persist:${String(prefix ?? "")}`).map((key) => key.slice("persist:".length)),
    persistenceMigrate: ({ entries }) => { if (Array.isArray(entries)) for (const entry of entries) if (isRecord(entry) && typeof entry.key === "string") settings.set(`persist:${entry.key}`, String(entry.value)); return true; },
    // attachments (Task 3 fills these in)
    ...attachments.handlers,
    // things herdr-bot does not have
    getExperimentsSnapshot: () => ({}),
    applyFeatureFlagOverride: () => undefined,
    refreshFeatureFlags: () => undefined,
    startRpcTraceWindow: () => false,
    getEgressTunnelEnabled: () => false,
    setEgressTunnelEnabled: () => false,
    getEgressTunnelStatus: () => null,
    getWebauthnProxyEnabled: () => false,
    setWebauthnProxyEnabled: () => false,
    forceRecreateComputer: () => null,
    updateComputer: () => null,
    forceReconnectGateway: () => undefined,
    listSecrets: () => ({ keys: [], isPersistent: false }),
    revealSecret: () => null,
    upsertSecrets: () => ({ synced: false }),
    removeSecrets: () => ({ synced: false }),
    mcpList: () => ({ servers: [] }),
    mcpEffectivePlugins: () => [],
    mcpCatalog: () => [],
    mcpTeamPopularity: () => ({}),
    mcpPluginLogo: () => null,
    getLinkMetadata: () => null,
    submitFeedback: () => { throw new Error("Feedback is not available in herdr-bot."); },
    transcribeAudio: () => { throw new Error("Voice transcription is not available in herdr-bot."); },
    generateAgentAvatarImage: () => { throw new Error("Avatar generation is not available in herdr-bot."); },
    pickAvatarSource: () => null,
    openCloudAgent: () => undefined,
    loginCursor: () => account,
    cancelCursorLogin: () => account,
    logoutCursor: () => account,
    updateCursorAccountName: () => account,
    invokeCursorDashboardAction: () => null,
    cancelCursorSandTrial: () => null,
    // window/theme pushes are wired in registerBridge
    _pushWindowState: () => { push("window-state", windowState()); },
    _pushZoom: () => { push("zoom-factor-changed", window.webContents.getZoomFactor()); },
    _pushTheme: () => { push("theme-changed", themeState(settings, nativeTheme)); },
  };
}

export function registerBridge(deps: BridgeDeps): void {
  const attachments = createAttachmentService({ dialog: deps.dialog, window: deps.window, userDataDir: deps.userDataDir });
  const handlers = createBridgeHandlers(deps, attachments);
  deps.ipcMain.handle("herdr-bot:bridge", async (_event, request: unknown) => {
    const method = isRecord(request) && typeof request.method === "string" ? request.method : "";
    const args = isRecord(request) && isRecord(request.args) ? request.args : {};
    const handler = handlers[method];
    if (handler == null) throw new Error(`unknown bridge method "${method}"`);
    try {
      return await handler(args);
    } catch (error) {
      log("bridge", `${method} failed`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  });
  deps.ipcMain.on("herdr-bot:bridge-sync", (event, request: unknown) => {
    const method = isRecord(request) && typeof request.method === "string" ? request.method : "";
    event.returnValue = method === "getThemeState" ? themeState(deps.settings, deps.nativeTheme) : null;
  });
  deps.nativeTheme.themeSource = deps.settings.get<ThemePreference>("theme.preference", "system");
  // OS theme flips only re-broadcast the resolved state; themeSource is assigned solely from the renderer's setThemePreference.
  deps.nativeTheme.on("updated", () => handlers._pushTheme!({}));
  const pushWindowState = () => handlers._pushWindowState!({});
  deps.window.on("enter-full-screen", pushWindowState);
  deps.window.on("leave-full-screen", pushWindowState);
  deps.window.on("maximize", pushWindowState);
  deps.window.on("unmaximize", pushWindowState);
  deps.window.webContents.on("zoom-changed", () => handlers._pushZoom!({}));
}
