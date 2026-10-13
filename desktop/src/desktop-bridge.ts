/**
 * Desktop-only features that have no equivalent on the host: theme/locale persistence, window chrome
 * controls, opening an external URL, native pickers, attachment staging, and app version/update checks.
 * Wired into `window.herdrBot` by preload.cts alongside the app-api client (app-api-bridge.ts) -- see
 * docs/app-api.md's "Desktop extras" section.
 */
import type { BrowserWindow, Dialog, IpcMain, NativeTheme } from "electron";
import { createAttachmentService, type AttachmentService } from "./attachments.ts";
import { isNewerVersion } from "./version-check.ts";
import type { ReleaseAsset, Updater } from "./app-update.ts";
import type { SettingsStore } from "./settings-store.ts";
import { log } from "../../core/src/log.ts";

export const DESKTOP_CALL_CHANNEL = "herdr-bot:desktop-call";
export const DESKTOP_SYNC_CHANNEL = "herdr-bot:desktop-sync";
export const DESKTOP_EVENT_CHANNEL = "herdr-bot:desktop-event";

export type ThemePreference = "system" | "light" | "dark";
export interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: "light" | "dark";
}

export type UpdateCheckState =
  | { readonly type: "idle"; readonly lastCheck?: { readonly at: number; readonly result: "up-to-date" | "error"; readonly errorMessage?: string } }
  | { readonly type: "available"; readonly version: string; readonly releaseUrl: string; readonly installError?: string }
  | { readonly type: "downloading"; readonly version: string; readonly releaseUrl: string; readonly progress: number }
  | { readonly type: "restarting"; readonly version: string };

export interface UpdateStatus {
  readonly state: UpdateCheckState;
  readonly currentVersion: string;
}

export interface DesktopBridgeDeps {
  readonly ipcMain: IpcMain;
  readonly window: BrowserWindow;
  readonly settings: SettingsStore;
  readonly nativeTheme: NativeTheme;
  readonly shell: { openExternal(url: string): Promise<void> };
  readonly dialog: Dialog;
  readonly appVersion: string;
  readonly userDataDir: string;
  /** GitHub `owner/repo` the update checker compares the running version's tag against. */
  readonly updateCheckRepo?: string;
  /** Installs a newer release in place (see app-update.ts). Without one, installing opens the release page. */
  readonly updater?: Updater;
  /** Called after the language changes, so the native menu can follow it. */
  readonly onLocaleChanged?: (locale: string | null) => void;
}

type Handler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function themeState(settings: SettingsStore, nativeTheme: NativeTheme): ThemeState {
  const preference = settings.get<ThemePreference>("theme.preference", "system");
  const resolved = preference === "system" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : preference;
  return { preference, resolved };
}

interface LatestRelease {
  readonly tag: string;
  readonly url: string;
  readonly assets: readonly ReleaseAsset[];
}

function releaseAssets(value: unknown): ReleaseAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((asset: unknown) => (isRecord(asset) && typeof asset.name === "string" && typeof asset.browser_download_url === "string" ? [{ name: asset.name, url: asset.browser_download_url }] : []));
}

// "Check for Updates" compares the running version against the latest GitHub release tag. Installing
// it is app-update.ts's job (no code-signing certificate, so not Squirrel.Mac's).
async function fetchLatestRelease(repo: string): Promise<LatestRelease | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) return null; // no release published yet
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const body = (await response.json()) as { tag_name?: unknown; html_url?: unknown; assets?: unknown };
  if (typeof body.tag_name !== "string" || body.tag_name.length === 0) return null;
  return { tag: body.tag_name, url: typeof body.html_url === "string" ? body.html_url : `https://github.com/${repo}/releases`, assets: releaseAssets(body.assets) };
}

async function checkForAppUpdate(appVersion: string, repo: string): Promise<{ readonly status: UpdateStatus; readonly release: LatestRelease | null }> {
  const now = Date.now();
  try {
    const release = await fetchLatestRelease(repo);
    if (release != null && isNewerVersion(appVersion, release.tag)) {
      return { release, status: { currentVersion: appVersion, state: { type: "available", version: release.tag.replace(/^v/i, ""), releaseUrl: release.url } } };
    }
    return { release: null, status: { currentVersion: appVersion, state: { type: "idle", lastCheck: { at: now, result: "up-to-date" } } } };
  } catch (error) {
    return { release: null, status: { currentVersion: appVersion, state: { type: "idle", lastCheck: { at: now, result: "error", errorMessage: error instanceof Error ? error.message : String(error) } } } };
  }
}

export function createDesktopBridgeHandlers(deps: DesktopBridgeDeps, attachments: AttachmentService): Record<string, Handler> {
  const { settings, window, nativeTheme, shell } = deps;
  const repo = deps.updateCheckRepo ?? "speardragon/herdr-bot";
  const push = (event: string, payload: unknown): void => {
    if (!window.isDestroyed()) window.webContents.send(DESKTOP_EVENT_CHANNEL, { event, payload });
  };
  // Cached so re-opening Settings does not re-hit the network; `update.check` is the one
  // that actually performs the GitHub lookup.
  let lastUpdateStatus: UpdateStatus = { currentVersion: deps.appVersion, state: { type: "idle" } };
  let lastRelease: LatestRelease | null = null;
  const setUpdateStatus = (state: UpdateCheckState): UpdateStatus => {
    lastUpdateStatus = { currentVersion: deps.appVersion, state };
    push("update-status", lastUpdateStatus);
    // The Dock icon shows the download's progress, so a menu-started update is visible without Settings open.
    if (!window.isDestroyed()) window.setProgressBar?.(state.type === "downloading" ? state.progress : -1);
    return lastUpdateStatus;
  };

  async function installUpdate(): Promise<UpdateStatus> {
    const state = lastUpdateStatus.state;
    if (state.type !== "available" || lastRelease == null) return lastUpdateStatus;
    const { version, releaseUrl } = state;
    const target = deps.updater == null ? null : await deps.updater.target();
    if (deps.updater == null || target == null) {
      await shell.openExternal(releaseUrl);
      return lastUpdateStatus;
    }
    let shown = 0;
    setUpdateStatus({ type: "downloading", version, releaseUrl, progress: 0 });
    try {
      await deps.updater.install({
        version,
        assets: lastRelease.assets,
        target,
        // Whole percents only, so a fast download does not flood the renderer with events.
        onProgress: (fraction) => {
          const percent = Math.floor(fraction * 100);
          if (percent > shown) { shown = percent; setUpdateStatus({ type: "downloading", version, releaseUrl, progress: percent / 100 }); }
        },
      });
    } catch (error) {
      log("desktop-bridge", "update install failed", error instanceof Error ? error.message : String(error));
      return setUpdateStatus({ type: "available", version, releaseUrl, installError: error instanceof Error ? error.message : String(error) });
    }
    const restarting = setUpdateStatus({ type: "restarting", version });
    deps.updater.quit();
    return restarting;
  }

  return {
    "theme.get": () => themeState(settings, nativeTheme),
    "theme.set": ({ preference }) => {
      if (preference === "system" || preference === "light" || preference === "dark") {
        settings.set("theme.preference", preference);
        nativeTheme.themeSource = preference;
      }
      const state = themeState(settings, nativeTheme);
      push("theme-changed", state);
      return state;
    },
    "locale.get": () => settings.get<string | null>("locale.preference", null),
    "locale.set": ({ locale }) => {
      const value = typeof locale === "string" && locale.length > 0 ? locale : null;
      settings.set("locale.preference", value);
      push("locale-changed", value);
      deps.onLocaleChanged?.(value);
      return value;
    },
    "window.minimize": () => { window.minimize(); },
    "window.toggleMaximize": () => { if (window.isMaximized()) window.unmaximize(); else window.maximize(); },
    "window.close": () => { window.close(); },
    "window.getState": () => ({ isFullscreen: window.isFullScreen(), isMaximized: window.isMaximized() }),
    "window.resizeWidth": ({ deltaWidth }) => {
      const [w = 0, h = 0] = window.getSize();
      const next = Math.max(512, w + (typeof deltaWidth === "number" ? deltaWidth : 0));
      window.setSize(next, h);
      return next;
    },
    "openExternal": async ({ url }) => { if (typeof url === "string" && /^https?:\/\//.test(url)) await shell.openExternal(url); },
    "onboarding.getSeen": () => settings.get("onboarding.seen", true),
    "onboarding.setSeen": ({ seen }) => { settings.set("onboarding.seen", seen === true); },
    "pins.get": () => settings.get<string[]>("pinnedChats", []),
    "pins.set": ({ chatIds }) => {
      const ids = Array.isArray(chatIds) ? chatIds.filter((id): id is string => typeof id === "string") : [];
      settings.set("pinnedChats", ids);
      return ids;
    },
    "version.get": () => deps.appVersion,
    "update.getStatus": () => lastUpdateStatus,
    // Pushed too, not just returned -- a UI element (e.g. a settings panel or command
    // palette entry) watching `update.onStatusChanged` only learns of a new status via the event.
    "update.check": async () => {
      // A download already under way keeps its status; checking again must not reset it to "available".
      if (lastUpdateStatus.state.type === "downloading" || lastUpdateStatus.state.type === "restarting") return lastUpdateStatus;
      const result = await checkForAppUpdate(deps.appVersion, repo);
      lastRelease = result.release;
      return setUpdateStatus(result.status.state);
    },
    "update.install": () => installUpdate(),
    ...attachments.handlers,
    // internal: pushed by registerDesktopBridge's native event listeners, not reachable from the renderer.
    "_pushTheme": () => { push("theme-changed", themeState(settings, nativeTheme)); },
    "_pushWindowState": () => { push("window-state", { isFullscreen: window.isFullScreen(), isMaximized: window.isMaximized() }); },
    "_pushZoom": () => { push("zoom-factor-changed", window.webContents.getZoomFactor()); },
  };
}

/** The `invoke` handler's logic, pulled out as a pure function so it is testable without a real
 * Electron `IpcMain`. Throws on an unknown method or a handler failure -- the desktop channel carries
 * only developer-facing errors (no `AppApiError.code` a UI branches on), so letting Electron's
 * `invoke` collapse it to a plain message (as it always does for a thrown value) is fine here, unlike
 * the app-api channel (see app-api-bridge.ts's `callAppApi`). */
export async function callDesktopBridge(handlers: Record<string, Handler>, request: unknown): Promise<unknown> {
  const method = isRecord(request) && typeof request.method === "string" ? request.method : "";
  const args = isRecord(request) && isRecord(request.params) ? request.params : {};
  const handler = handlers[method];
  if (handler == null) throw new Error(`unknown desktop method "${method}"`);
  try {
    return await handler(args);
  } catch (error) {
    log("desktop-bridge", `${method} failed`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** Registers the bridge and returns its handlers, so the native menu can drive the same update flow. */
export function registerDesktopBridge(deps: DesktopBridgeDeps): Record<string, Handler> {
  const attachments = createAttachmentService({ dialog: deps.dialog, window: deps.window, userDataDir: deps.userDataDir });
  const handlers = createDesktopBridgeHandlers(deps, attachments);
  deps.ipcMain.handle(DESKTOP_CALL_CHANNEL, (_event, request: unknown) => callDesktopBridge(handlers, request));
  // A synchronous read so preload can seed `theme.initial` before first paint (an async
  // round trip would flash the wrong theme for one frame).
  deps.ipcMain.on(DESKTOP_SYNC_CHANNEL, (event, request: unknown) => {
    const method = isRecord(request) && typeof request.method === "string" ? request.method : "";
    event.returnValue = method === "theme.get" ? themeState(deps.settings, deps.nativeTheme) : null;
  });
  deps.nativeTheme.themeSource = deps.settings.get<ThemePreference>("theme.preference", "system");
  // OS theme flips only re-broadcast the resolved state; themeSource is assigned solely via theme.set.
  deps.nativeTheme.on("updated", () => handlers._pushTheme!({}));
  const pushWindowState = () => handlers._pushWindowState!({});
  deps.window.on("enter-full-screen", pushWindowState);
  deps.window.on("leave-full-screen", pushWindowState);
  deps.window.on("maximize", pushWindowState);
  deps.window.on("unmaximize", pushWindowState);
  deps.window.webContents.on("zoom-changed", () => handlers._pushZoom!({}));
  return handlers;
}
