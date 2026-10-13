/**
 * The ONE object herdr-bot's renderer gets: `window.herdrBot`. It bundles the transport-agnostic
 * app-api client's transport (`api`) with every desktop-only feature (theme/locale, window chrome,
 * external links, native pickers, attachments, app version/update check). See docs/app-api.md.
 *
 * This file compiles to CommonJS (the `.cts` extension forces it, required for an Electron preload
 * script loaded with contextIsolation+sandbox) while the rest of the repo is ESM ("type": "module") --
 * a CJS module cannot `require()` an ESM one, so nothing here imports a runtime value from core/ or
 * desktop/src/*.ts; only `import type` (fully erased, no `require()` emitted) crosses that boundary.
 * The channel name string literals are intentionally duplicated from app-api-bridge.ts/desktop-bridge.ts
 * for the same reason -- keep them in sync if either changes.
 */
import { contextBridge, ipcRenderer, webFrame } from "electron";
import type { AppApiEvent } from "../../core/src/app-api/types.ts";
import type { AppApiIpcEnvelope } from "./app-api-bridge.ts";
import type { ThemeState } from "./desktop-bridge.ts";

const API_CALL_CHANNEL = "herdr-bot:api-call";
const API_EVENT_CHANNEL = "herdr-bot:api-event";
const DESKTOP_CALL_CHANNEL = "herdr-bot:desktop-call";
const DESKTOP_SYNC_CHANNEL = "herdr-bot:desktop-sync";
const DESKTOP_EVENT_CHANNEL = "herdr-bot:desktop-event";

// ---------------------------------------------------------------------------------------------------
// App API transport: satisfies core/src/app-api/client.ts's `AppApiTransport` shape so the renderer
// just does `createAppClient(window.herdrBot.api)`.
// ---------------------------------------------------------------------------------------------------

async function call(method: string, params: unknown): Promise<unknown> {
  const envelope = (await ipcRenderer.invoke(API_CALL_CHANNEL, { method, params })) as AppApiIpcEnvelope;
  if (envelope.ok) return envelope.value;
  throw envelope.error;
}

function subscribe(onEvent: (event: AppApiEvent) => void): () => void {
  const listener = (_event: unknown, appApiEvent: AppApiEvent): void => onEvent(appApiEvent);
  ipcRenderer.on(API_EVENT_CHANNEL, listener as never);
  return () => ipcRenderer.removeListener(API_EVENT_CHANNEL, listener as never);
}

// ---------------------------------------------------------------------------------------------------
// Desktop-only extras
// ---------------------------------------------------------------------------------------------------

type DesktopListener = (payload: unknown) => void;
const desktopListeners = new Map<string, Set<DesktopListener>>();
ipcRenderer.on(DESKTOP_EVENT_CHANNEL, (_event, message: { event: string; payload: unknown }) => {
  for (const listener of [...(desktopListeners.get(message.event) ?? [])]) listener(message.payload);
});

function onDesktopEvent(event: string): (listener: DesktopListener) => () => void {
  return (listener) => {
    const set = desktopListeners.get(event) ?? new Set<DesktopListener>();
    set.add(listener);
    desktopListeners.set(event, set);
    return () => { set.delete(listener); };
  };
}

function desktopCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return ipcRenderer.invoke(DESKTOP_CALL_CHANNEL, { method, params });
}

function desktopSync(method: string): unknown {
  return ipcRenderer.sendSync(DESKTOP_SYNC_CHANNEL, { method });
}

const themeInitial = desktopSync("theme.get") as ThemeState;

const herdrBot = {
  api: { call, subscribe },

  platform: process.platform,
  isDev: process.env.HERDR_BOT_DEV === "1",

  theme: {
    initial: themeInitial,
    get: () => desktopCall("theme.get") as Promise<ThemeState>,
    set: (preference: "system" | "light" | "dark") => desktopCall("theme.set", { preference }) as Promise<ThemeState>,
    onChanged: onDesktopEvent("theme-changed"),
  },
  locale: {
    initial: null as string | null,
    get: () => desktopCall("locale.get") as Promise<string | null>,
    set: (locale: string | null) => desktopCall("locale.set", { locale }) as Promise<string | null>,
    onChanged: onDesktopEvent("locale-changed"),
  },

  window: {
    minimize: () => desktopCall("window.minimize") as Promise<void>,
    toggleMaximize: () => desktopCall("window.toggleMaximize") as Promise<void>,
    close: () => desktopCall("window.close") as Promise<void>,
    getState: () => desktopCall("window.getState") as Promise<{ isFullscreen: boolean; isMaximized: boolean }>,
    resizeWidth: (deltaWidth: number) => desktopCall("window.resizeWidth", { deltaWidth }) as Promise<number>,
    onStateChanged: onDesktopEvent("window-state"),
    getZoomFactor: () => webFrame.getZoomFactor(),
    onZoomChanged: onDesktopEvent("zoom-factor-changed"),
  },

  openExternal: (url: string) => desktopCall("openExternal", { url }) as Promise<void>,
  pickDirectory: (defaultPath?: string) => desktopCall("pickDirectory", { defaultPath }) as Promise<string | null>,
  pickAvatarFile: () => desktopCall("pickAvatarFile") as Promise<{ dataUrl: string; fileName: string } | null>,

  attachments: {
    stage: (filename: string, bytes: Uint8Array) => desktopCall("stageAttachmentBytes", { filename, bytes }) as Promise<{ ok: true; path: string } | { ok: false; reason: "empty" | "too-large" | "failed" }>,
    commit: (paths: readonly string[]) => desktopCall("commitStagedAttachments", { paths: [...paths] }) as Promise<string[] | null>,
    discard: (path: string) => desktopCall("discardStagedAttachment", { path }) as Promise<void>,
    resolveMedia: (source: string) => desktopCall("resolveAttachmentMedia", { source }) as Promise<unknown>,
    readText: (path: string) => desktopCall("readAttachmentText", { path }) as Promise<unknown>,
    readBytes: (path: string, maxBytes: number) => desktopCall("readAttachmentBytes", { path, maxBytes }) as Promise<unknown>,
    download: (path: string, suggestedName?: string) => desktopCall("downloadAttachment", { path, suggestedName }) as Promise<boolean>,
  },

  version: {
    get: () => desktopCall("version.get") as Promise<string>,
    update: {
      getStatus: () => desktopCall("update.getStatus"),
      check: () => desktopCall("update.check"),
      install: () => desktopCall("update.install"),
      onStatusChanged: onDesktopEvent("update-status"),
    },
  },

  onboarding: {
    getSeen: () => desktopCall("onboarding.getSeen") as Promise<boolean>,
    setSeen: (seen: boolean) => desktopCall("onboarding.setSeen", { seen }) as Promise<void>,
  },
  pins: {
    get: () => desktopCall("pins.get") as Promise<string[]>,
    set: (chatIds: readonly string[]) => desktopCall("pins.set", { chatIds: [...chatIds] }) as Promise<string[]>,
  },
};

export type HerdrBotBridge = typeof herdrBot;

contextBridge.exposeInMainWorld("herdrBot", herdrBot);
