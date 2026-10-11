/**
 * Wires the app API (core/src/app-api) to Electron ipc: one `invoke` channel for calls, one `send`
 * channel for the event stream. This is the transport choice for herdr-bot's UI<->host connection --
 * see docs/app-api.md's "Transport" section for the reasoning (no handshake, no requestId bookkeeping,
 * contextBridge-native, Electron's own `invoke` already correlates request/reply).
 */
import type { BrowserWindow, IpcMain } from "electron";
import type { AppApiServer } from "../../core/src/app-api/server.ts";
import { toAppApiError } from "../../core/src/app-api/errors.ts";
import { log } from "../../core/src/log.ts";

export const APP_API_CALL_CHANNEL = "herdr-bot:api-call";
export const APP_API_EVENT_CHANNEL = "herdr-bot:api-event";

/** What actually crosses the ipc boundary for every call -- never a thrown value. Electron's `invoke`
 * does not preserve a thrown Error's custom properties (only `.message` survives, remapped into a new
 * Error on the renderer side), which would silently drop every `AppApiError.code` a UI needs to branch
 * on. Resolving with a tagged envelope instead keeps `code` intact; the preload's transport (see
 * preload.cts) unwraps `ok: false` back into a rejection `createAppClient` can parse. */
export type AppApiIpcEnvelope = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `invoke` handler's logic, pulled out as a pure function of `(server, request)` so it is testable
 * without a real Electron `IpcMain`. */
export async function callAppApi(server: AppApiServer, request: unknown): Promise<AppApiIpcEnvelope> {
  const method = isRecord(request) && typeof request.method === "string" ? request.method : "";
  try {
    return { ok: true, value: await server.call(method, isRecord(request) ? request.params : undefined) };
  } catch (error) {
    const appApiError = toAppApiError(error);
    log("app-api-bridge", `${method} failed`, appApiError.message);
    return { ok: false, error: appApiError.toPayload() };
  }
}

/** Registers the `invoke` handler and starts forwarding every app-api event to `window`. Returns an
 * unsubscribe so the caller can stop forwarding (e.g. on window close) without touching the ipcMain
 * handler, which must only ever be registered once per process. */
export function registerAppApiBridge(ipcMainInstance: IpcMain, window: BrowserWindow, server: AppApiServer): () => void {
  ipcMainInstance.handle(APP_API_CALL_CHANNEL, (_event, request: unknown) => callAppApi(server, request));
  return server.subscribe((event) => {
    if (!window.isDestroyed()) window.webContents.send(APP_API_EVENT_CHANNEL, event);
  });
}
