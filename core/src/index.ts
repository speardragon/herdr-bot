export { resolveConfig, hostPaths, type HostConfig } from "./config.ts";
export { createHost, type Host, type HostStatus, type SendUserMessageArgs } from "./host.ts";
export { HostEvents, type HostEventFamily } from "./host-events.ts";
export { createHerdrCli, type HerdrCli } from "./herdr/cli.ts";
export { HerdrError, type HerdrAgentInfo, type BotRuntime } from "./herdr/types.ts";
export { controlRequest } from "./control/client.ts";
export { ControlError } from "./control/protocol.ts";
export type { AgentSummary } from "./model/summaries.ts";
export type { BotProfile, PermissionMode } from "./store/profile-store.ts";
export type { RoomConfig } from "./store/room-store.ts";
export type { StoredEntry, TranscriptPage } from "./store/transcript-store.ts";
export { SUPPORTED_KINDS } from "./bots/launch-args.ts";
// The app API -- a transport-agnostic protocol between the host and its UI. `createAppApiServer`
// is server-only (pulls in `Host`); `createAppClient`/`createInMemoryTransport`/the wire types are
// dependency-free and safe for a renderer to bundle. See docs/app-api.md.
export { createAppApiServer, type AppApiServer } from "./app-api/server.ts";
export { createAppClient, type AppApiClient, type AppApiClientOptions, type AppApiTransport } from "./app-api/client.ts";
export { createInMemoryTransport, type AppApiServerLike } from "./app-api/in-memory-transport.ts";
export { AppApiError, isAppApiError, toAppApiError } from "./app-api/errors.ts";
export type * from "./app-api/types.ts";
