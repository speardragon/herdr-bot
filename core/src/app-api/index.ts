/**
 * Barrel for the host/server side of the app API. A renderer must NOT import this file (it pulls in
 * core/src/host.ts and everything under it) -- it should import only from `./types.ts` and `./client.ts`
 * (and `./in-memory-transport.ts` for tests). See docs/app-api.md.
 */
export { createAppApiServer, type AppApiServer } from "./server.ts";
export { createAppClient, type AppApiClient, type AppApiClientOptions, type AppApiTransport } from "./client.ts";
export { createInMemoryTransport, type AppApiServerLike } from "./in-memory-transport.ts";
export { AppApiError, isAppApiError, toAppApiError } from "./errors.ts";
export * from "./types.ts";
