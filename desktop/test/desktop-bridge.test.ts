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
