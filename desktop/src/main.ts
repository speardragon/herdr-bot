import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, nativeTheme, shell } from "electron";
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "../../core/src/config.ts";
import { createHost, type Host } from "../../core/src/host.ts";
import { log } from "../../core/src/log.ts";
import { registerBridge } from "./bridge-main.ts";
import { attachRendererPort } from "./coordinator-port.ts";
import { SettingsStore } from "./settings-store.ts";
import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, WINDOW_BACKGROUND, windowChromeOptions } from "./window-chrome.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rendererIndex = join(here, "..", "..", "..", "..", "renderer", "dist", "index.html");
const preloadPath = join(here, "preload.cjs");

async function bootHost(): Promise<Host> {
  const config = resolveConfig(process.env);
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
    backgroundColor: WINDOW_BACKGROUND,
    show: false,
    ...windowChromeOptions(process.platform),
    webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  registerBridge({ ipcMain, window, settings, host, nativeTheme, shell, dialog, appVersion: app.getVersion(), userDataDir: app.getPath("userData"), userName: host.config.userName || userInfo().username });
  ipcMain.on("herdr-bot:coordinator-port-request", (event) => {
    if (event.sender !== window.webContents) return;
    const { port1, port2 } = new MessageChannelMain();
    attachRendererPort(port1, host);
    event.sender.postMessage("herdr-bot:coordinator-port", null, [port2]);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.once("ready-to-show", () => window.show());
  return window;
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

app.whenReady().then(async () => {
  const host = await bootHost();
  const window = createWindow(host);
  await loadRenderer(window);
  if (process.env.HERDR_BOT_SMOKE === "1") {
    const mounted = await window.webContents.executeJavaScript("document.getElementById('root')?.childElementCount > 0");
    process.stdout.write(`smoke: ${mounted === true ? "ok" : "empty-root"}\n`);
    await host.stop();
    app.quit();
    return;
  }
  app.on("before-quit", () => { void host.stop(); });
}).catch((error: unknown) => {
  log("desktop", "startup failed", error instanceof Error ? error.stack ?? error.message : String(error));
  dialog.showErrorBox("herdr-bot could not start", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
