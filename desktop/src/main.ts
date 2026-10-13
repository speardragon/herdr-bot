import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installShim } from "../../cli/src/shim.ts";
import { createAppApiServer, type AppApiServer } from "../../core/src/app-api/server.ts";
import { resolveConfig } from "../../core/src/config.ts";
import { createHost, type Host } from "../../core/src/host.ts";
import { log } from "../../core/src/log.ts";
import { registerAppApiBridge } from "./app-api-bridge.ts";
import { appMenuTemplate, menuLanguage, updateText } from "./app-menu.ts";
import { createUpdater } from "./app-update.ts";
import { registerDesktopBridge } from "./desktop-bridge.ts";
import { FALLBACK_PATH_DIRS, mergePath, resolveLoginShellPath } from "./login-shell-path.ts";
import { SettingsStore } from "./settings-store.ts";
import { hostReferenceFiles, sweepStagedAttachments } from "./staged-attachment-sweep.ts";
import { checkForUpdatesFromMenu } from "./update-dialog.ts";
import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, shouldHideInsteadOfClose, shouldQuitOnWindowAllClosed, windowBackground, windowChromeOptions } from "./window-chrome.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rendererIndex = app.isPackaged
  ? join(process.resourcesPath, "app", "renderer", "dist", "index.html")
  : join(here, "..", "..", "..", "..", "renderer", "dist", "index.html");
const preloadPath = join(here, "preload.cjs");
// electron-builder bakes build/icon.icns into the packaged bundle; an unpackaged run has to point
// at it itself, or the Dock and the window show Electron's own icon.
const appIconPath = join(here, "..", "..", "..", "build", "icon.png");
// The CLI (cli/src) is compiled alongside desktop/src into this same dist tree (see desktop/tsconfig.json),
// so its compiled entry sits at dist/cli/src/main.js in both layouts below -- dev's `here` is
// desktop/dist/desktop/src, and the packaged app's un-asar'd Resources/app mirrors desktop/dist/ directly.
const cliMainPath = app.isPackaged
  ? join(process.resourcesPath, "app", "dist", "cli", "src", "main.js")
  : join(here, "..", "..", "cli", "src", "main.js");

// Electron's single-instance lock (Chromium's ProcessSingleton) is keyed on the userData
// directory, not on HERDR_BOT_HOME -- two copies that happen to share the default userData path would
// collide into one lock even with different bot homes. Pinning userData under an explicitly-set
// HERDR_BOT_HOME (QA/demo instances, or a dev run) gives each its own lock *and* its own desktop
// settings file, so they can run side by side; ordinary users who never set HERDR_BOT_HOME keep
// Electron's normal userData path unchanged.
const explicitHome = process.env.HERDR_BOT_HOME;
// An explicit --user-data-dir (Electron's own built-in switch) already relocates userData -- and thus
// the lock -- on its own, so it wins over the env-derived default here rather than being silently
// overridden.
if (explicitHome != null && explicitHome.length > 0 && !app.commandLine.hasSwitch("user-data-dir")) {
  mkdirSync(explicitHome, { recursive: true });
  app.setPath("userData", join(explicitHome, "desktop-userdata"));
} else if (!app.commandLine.hasSwitch("user-data-dir")) {
  // The packaged app's default userData is ".../Application Support/herdr-bot" (its productName), but a
  // source or herdr-plugin build runs as "@herdr-bot/desktop". Pin every build to the packaged path so
  // they all share one lock -- and one settings file -- for the default ~/.herdr-bot.
  app.setPath("userData", join(app.getPath("appData"), "herdr-bot"));
}

// On macOS the window hides rather than closes (see shouldHideInsteadOfClose below), so the
// window object is never recreated -- registerBridge's ipcMain.handle calls would throw on a second
// call -- and `activate` just needs a handle to show it again.
let mainWindow: BrowserWindow | null = null;
let appApiServer: AppApiServer | null = null;
let isQuitting = false;

// A second launch (the DMG copy opened while a dev copy runs, a herdr plugin action that
// re-invokes the binary, ...) must never start a second host on the same <HERDR_BOT_HOME>/host.sock.
// requestSingleInstanceLock() must be called before anything else boots; if it is not granted, another
// instance (sharing this same userData dir, see above) already holds it, so just hand off and quit.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow == null || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (process.platform === "darwin") app.focus({ steal: true });
  });
}

/** Merges the user's login-shell PATH into process.env.PATH once at startup (see login-shell-path.ts for why). */
async function applyLoginShellPath(): Promise<void> {
  const startedAt = Date.now();
  const loginPath = await resolveLoginShellPath();
  log("desktop", "login shell PATH probe", { resolved: loginPath != null, ms: Date.now() - startedAt });
  process.env.PATH = mergePath(process.env.PATH ?? "", loginPath, FALLBACK_PATH_DIRS);
}

async function bootHost(): Promise<Host> {
  await applyLoginShellPath();
  const config = resolveConfig(process.env);
  // Bots talk to the app exclusively through this CLI shim (core/src/bots/launch-args.ts pre-approves
  // `Bash(<cliPath> *)`); write/refresh it on every start so a bot never finds it missing or stale.
  installShim(config.home, process.execPath, cliMainPath, { electronRunAsNode: true });
  const host = createHost(config);
  await host.start();
  return host;
}

function createWindow(host: Host): BrowserWindow {
  const settings = new SettingsStore(join(app.getPath("userData"), "herdr-bot-desktop.json"));
  const window = new BrowserWindow({
    ...DEFAULT_WINDOW_SIZE,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    backgroundColor: windowBackground(nativeTheme.shouldUseDarkColors),
    ...(app.isPackaged || !existsSync(appIconPath) ? {} : { icon: appIconPath }),
    show: false,
    ...windowChromeOptions(process.platform),
    webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  appApiServer = createAppApiServer(host);
  registerAppApiBridge(ipcMain, window, appApiServer);
  const updater = createUpdater({ isPackaged: app.isPackaged, exePath: app.getPath("exe"), arch: process.arch, pid: process.pid, logFile: join(app.getPath("userData"), "update.log"), quit: () => app.quit() });
  const handlers = registerDesktopBridge({ ipcMain, window, settings, nativeTheme, shell, dialog, appVersion: app.getVersion(), userDataDir: app.getPath("userData"), updater, onLocaleChanged: (locale) => installMenu(window, handlers, locale) });
  installMenu(window, handlers, settings.get<string | null>("locale.preference", null));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.on("close", (event) => {
    if (!shouldHideInsteadOfClose(process.platform, isQuitting)) return;
    event.preventDefault();
    window.hide();
  });
  window.once("ready-to-show", () => {
    window.show();
    // Off the critical path -- the staged/ sweep does a handful of small file reads/stats,
    // but there is no reason to make the window's first paint wait on it.
    setImmediate(() => {
      void (async () => {
        const referenceFiles = [...(await hostReferenceFiles(host.config.home)), join(app.getPath("userData"), "herdr-bot-desktop.json")];
        return sweepStagedAttachments({ stagedDir: join(app.getPath("userData"), "staged"), referenceFiles, now: Date.now });
      })().catch((error: unknown) => log("desktop", "staged attachment sweep failed", error instanceof Error ? error.message : String(error)));
    });
  });
  return window;
}

/** The menu bar, in the app's language; rebuilt when the language changes. */
function installMenu(window: BrowserWindow, handlers: ReturnType<typeof registerDesktopBridge>, localePreference: string | null): void {
  const language = menuLanguage(localePreference, app.getLocale());
  const onCheckForUpdates = () => {
    checkForUpdatesFromMenu({ handlers, dialog, window, text: updateText(language), openExternal: (url) => shell.openExternal(url) })
      .catch((error: unknown) => log("desktop", "menu update check failed", error instanceof Error ? error.message : String(error)));
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate("herdr-bot", language, onCheckForUpdates)));
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const devUrl = process.env.HERDR_BOT_RENDERER_URL;
  if (devUrl != null && devUrl.length > 0) {
    await window.loadURL(devUrl);
    return;
  }
  if (!existsSync(rendererIndex)) throw new Error(`renderer build missing at ${rendererIndex}; run \`npm run renderer:build\``);
  await window.loadFile(rendererIndex);
}

// Everything below only runs for the instance that actually holds the single-instance lock
// -- a losing instance already called app.quit() above and must not boot a second host.
if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
    if (!app.isPackaged && app.dock != null && existsSync(appIconPath)) app.dock.setIcon(appIconPath);
    const host = await bootHost();
    // Registered before createWindow (which wires the close->hide handler that reads
    // isQuitting) rather than after loadRenderer -- a Cmd+Q during the `await loadRenderer` below used
    // to race ahead of this listener, leaving isQuitting false when "close" fired on macOS, so the
    // close handler hid the window instead of letting it close and the quit was silently swallowed.
    app.on("before-quit", () => { isQuitting = true; appApiServer?.close(); void host.stop(); });
    const window = createWindow(host);
    mainWindow = window;
    await loadRenderer(window);
    if (process.env.HERDR_BOT_SMOKE === "1") {
      const mounted = await window.webContents.executeJavaScript("document.getElementById('root')?.childElementCount > 0");
      process.stdout.write(`smoke: ${mounted === true ? "ok" : "empty-root"}\n`);
      await host.stop();
      app.exit(mounted === true ? 0 : 1);
      return;
    }
  }).catch((error: unknown) => {
    log("desktop", "startup failed", error instanceof Error ? error.stack ?? error.message : String(error));
    dialog.showErrorBox("herdr-bot could not start", error instanceof Error ? error.message : String(error));
    app.exit(1);
  });

  app.on("window-all-closed", () => {
    if (shouldQuitOnWindowAllClosed(process.platform)) app.quit();
  });

  // The Dock icon stays after the window hides (see shouldHideInsteadOfClose); clicking it
  // re-shows the existing window instead of creating a new one (registerBridge must only ever run once).
  app.on("activate", () => {
    if (mainWindow != null && !mainWindow.isDestroyed()) mainWindow.show();
  });
}
