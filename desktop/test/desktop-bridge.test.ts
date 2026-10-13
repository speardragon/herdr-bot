import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { createDesktopBridgeHandlers, callDesktopBridge, type DesktopBridgeDeps } from "../src/desktop-bridge.ts";
import { createAttachmentService } from "../src/attachments.ts";
import { SettingsStore } from "../src/settings-store.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

function fakeDeps(temp: string, overrides: Partial<DesktopBridgeDeps> = {}): DesktopBridgeDeps {
  const sent: { event: string; payload: unknown }[] = [];
  const window = {
    isDestroyed: () => false,
    isMaximized: () => false,
    isFullScreen: () => false,
    minimize: () => {},
    maximize: () => {},
    unmaximize: () => {},
    close: () => {},
    getSize: () => [800, 600],
    setSize: () => {},
    webContents: { getZoomFactor: () => 1, send: (event: string, payload: unknown) => sent.push({ event, payload }) },
  } as unknown as DesktopBridgeDeps["window"];
  const nativeTheme = { shouldUseDarkColors: false, themeSource: "system", on: () => {} } as unknown as DesktopBridgeDeps["nativeTheme"];
  return {
    ipcMain: { handle: () => {}, on: () => {} } as unknown as DesktopBridgeDeps["ipcMain"],
    window,
    settings: new SettingsStore(join(temp, "settings.json")),
    nativeTheme,
    shell: { openExternal: async () => {} },
    dialog: {} as DesktopBridgeDeps["dialog"],
    appVersion: "1.2.3",
    userDataDir: temp,
    ...overrides,
    // expose the sent-events array for assertions via a loose cast in the tests below
    ...( { __sent: sent } as unknown as Partial<DesktopBridgeDeps>),
  };
}

test("theme.get/theme.set round-trip and persist the preference", async () => {
  const temp = makeTempHome();
  try {
    const deps = fakeDeps(temp.home);
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    assert.deepEqual(await callDesktopBridge(handlers, { method: "theme.get", params: {} }), { preference: "system", resolved: "light" });
    const set = await callDesktopBridge(handlers, { method: "theme.set", params: { preference: "dark" } });
    assert.deepEqual(set, { preference: "dark", resolved: "dark" });
    assert.deepEqual(await callDesktopBridge(handlers, { method: "theme.get", params: {} }), { preference: "dark", resolved: "dark" });
  } finally {
    temp.cleanup();
  }
});

test("locale.get/locale.set round-trip, defaulting to null", async () => {
  const temp = makeTempHome();
  try {
    const deps = fakeDeps(temp.home);
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    assert.equal(await callDesktopBridge(handlers, { method: "locale.get", params: {} }), null);
    assert.equal(await callDesktopBridge(handlers, { method: "locale.set", params: { locale: "ko" } }), "ko");
    assert.equal(await callDesktopBridge(handlers, { method: "locale.get", params: {} }), "ko");
  } finally {
    temp.cleanup();
  }
});

test("window controls dispatch to the underlying BrowserWindow", async () => {
  const temp = makeTempHome();
  try {
    let maximized = false;
    const deps = fakeDeps(temp.home);
    (deps.window as unknown as { isMaximized(): boolean }).isMaximized = () => maximized;
    (deps.window as unknown as { maximize(): void }).maximize = () => { maximized = true; };
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    assert.deepEqual(await callDesktopBridge(handlers, { method: "window.getState", params: {} }), { isFullscreen: false, isMaximized: false });
    await callDesktopBridge(handlers, { method: "window.toggleMaximize", params: {} });
    assert.equal(maximized, true);
    const width = await callDesktopBridge(handlers, { method: "window.resizeWidth", params: { deltaWidth: -1000 } });
    assert.equal(width, 512); // clamped to the minimum width
  } finally {
    temp.cleanup();
  }
});

test("onboarding.getSeen/setSeen and pins.get/set round-trip through settings", async () => {
  const temp = makeTempHome();
  try {
    const deps = fakeDeps(temp.home);
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    assert.equal(await callDesktopBridge(handlers, { method: "onboarding.getSeen", params: {} }), true);
    await callDesktopBridge(handlers, { method: "onboarding.setSeen", params: { seen: false } });
    assert.equal(await callDesktopBridge(handlers, { method: "onboarding.getSeen", params: {} }), false);

    assert.deepEqual(await callDesktopBridge(handlers, { method: "pins.get", params: {} }), []);
    assert.deepEqual(await callDesktopBridge(handlers, { method: "pins.set", params: { chatIds: ["a", "b"] } }), ["a", "b"]);
    assert.deepEqual(await callDesktopBridge(handlers, { method: "pins.get", params: {} }), ["a", "b"]);
  } finally {
    temp.cleanup();
  }
});

test("version.get returns the injected app version; an unknown method rejects", async () => {
  const temp = makeTempHome();
  try {
    const deps = fakeDeps(temp.home);
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    assert.equal(await callDesktopBridge(handlers, { method: "version.get", params: {} }), "1.2.3");
    await assert.rejects(callDesktopBridge(handlers, { method: "not.a.method", params: {} }), /unknown desktop method/);
  } finally {
    temp.cleanup();
  }
});

test("openExternal only opens http(s) URLs", async () => {
  const temp = makeTempHome();
  try {
    const opened: string[] = [];
    const deps = fakeDeps(temp.home, { shell: { openExternal: async (url: string) => { opened.push(url); } } });
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    await callDesktopBridge(handlers, { method: "openExternal", params: { url: "https://example.com" } });
    await callDesktopBridge(handlers, { method: "openExternal", params: { url: "file:///etc/passwd" } });
    assert.deepEqual(opened, ["https://example.com"]);
  } finally {
    temp.cleanup();
  }
});

function stubLatestRelease(tag: string): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    tag_name: tag,
    html_url: `https://github.com/speardragon/herdr-bot/releases/tag/${tag}`,
    assets: [{ name: `herdr-bot-${tag.slice(1)}-arm64.zip`, browser_download_url: "https://example.test/a.zip" }],
  }), { status: 200 })) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test("update.install downloads through the updater, reports progress, then restarts", async () => {
  const temp = makeTempHome();
  const restore = stubLatestRelease("v9.0.0");
  try {
    let quit = false;
    let installed: { version: string; assets: readonly unknown[]; target: string } | null = null;
    const deps = fakeDeps(temp.home, {
      updater: {
        target: async () => "/Applications/herdr-bot.app",
        install: async (args) => { installed = args; args.onProgress(0.5); args.onProgress(0.504); args.onProgress(1); },
        quit: () => { quit = true; },
      },
    });
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    const checked = await callDesktopBridge(handlers, { method: "update.check", params: {} }) as { state: { type: string } };
    assert.equal(checked.state.type, "available");
    const result = await callDesktopBridge(handlers, { method: "update.install", params: {} }) as { state: { type: string; version: string } };
    assert.deepEqual(result.state, { type: "restarting", version: "9.0.0" });
    assert.equal(installed!.version, "9.0.0");
    assert.equal(installed!.target, "/Applications/herdr-bot.app");
    assert.equal(installed!.assets.length, 1);
    assert.equal(quit, true);
    // webContents.send(channel, { event, payload }) -- the fake records the channel as `event`.
    const sent = (deps as unknown as { __sent: { payload: { event: string; payload: { state: { type: string; progress?: number } } } }[] }).__sent.map((call) => call.payload);
    const progress = sent.filter((e) => e.event === "update-status" && e.payload.state.type === "downloading").map((e) => e.payload.state.progress);
    assert.deepEqual(progress, [0, 0.5, 1]); // whole percents only
  } finally {
    restore();
    temp.cleanup();
  }
});

test("update.install keeps the version available with the error when installing fails", async () => {
  const temp = makeTempHome();
  const restore = stubLatestRelease("v9.0.0");
  try {
    const deps = fakeDeps(temp.home, { updater: { target: async () => "/Applications/herdr-bot.app", install: async () => { throw new Error("checksum mismatch"); }, quit: () => assert.fail("must not quit") } });
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    await callDesktopBridge(handlers, { method: "update.check", params: {} });
    const result = await callDesktopBridge(handlers, { method: "update.install", params: {} }) as { state: unknown };
    assert.deepEqual(result.state, { type: "available", version: "9.0.0", releaseUrl: "https://github.com/speardragon/herdr-bot/releases/tag/v9.0.0", installError: "checksum mismatch" });
  } finally {
    restore();
    temp.cleanup();
  }
});

test("update.install opens the release page when this build cannot update itself", async () => {
  const temp = makeTempHome();
  const restore = stubLatestRelease("v9.0.0");
  try {
    const opened: string[] = [];
    const deps = fakeDeps(temp.home, { shell: { openExternal: async (url) => { opened.push(url); } }, updater: { target: async () => null, install: async () => assert.fail("must not install"), quit: () => {} } });
    const handlers = createDesktopBridgeHandlers(deps, createAttachmentService({ dialog: null, window: null, userDataDir: temp.home }));
    await callDesktopBridge(handlers, { method: "update.check", params: {} });
    const result = await callDesktopBridge(handlers, { method: "update.install", params: {} }) as { state: { type: string } };
    assert.equal(result.state.type, "available");
    assert.deepEqual(opened, ["https://github.com/speardragon/herdr-bot/releases/tag/v9.0.0"]);
  } finally {
    restore();
    temp.cleanup();
  }
});
