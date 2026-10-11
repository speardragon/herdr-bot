/**
 * Builds the renderer's `AppApiClient` over whatever `AppApiTransport` is available: the real desktop
 * bridge (`window.herdrBot.api`) or, in the browser dev-harness (`?demo`), an in-memory fake (see
 * src/dev/fake-herdr-bot.ts). Nothing here is Electron-specific -- it only depends on the transport
 * shape, so a future transport only has to satisfy `AppApiTransport`.
 */
import { createAppClient } from "./types.ts";
import type { AppApiClient, AppApiTransport } from "./types.ts";

export interface CreateRendererClientOptions {
  readonly onResyncNeeded?: () => void;
}

export function createRendererClient(transport: AppApiTransport, options: CreateRendererClientOptions = {}): AppApiClient {
  return createAppClient(transport, options);
}
