/**
 * An `AppApiTransport` that talks to an in-process `AppApiServer` directly -- no socket, no ipc. Used
 * by tests (see core/test/app-api/*.test.ts) and by anything else that wants the renderer-facing
 * `AppApiClient` shape without a real desktop transport in between.
 *
 * Round-trips every call's params/result (and every event payload) through `structuredClone`, the same
 * way Electron's ipc/MessagePort transports serialize values -- a bug where a handler accidentally
 * returns something non-cloneable (a class instance, a function) fails here exactly as it would in the
 * real desktop app, instead of silently working because the in-memory transport skipped serialization.
 */
import type { AppApiTransport } from "./client.ts";
import type { AppApiEvent } from "./types.ts";

export interface AppApiServerLike {
  call(method: string, params: unknown): Promise<unknown>;
  subscribe(onEvent: (event: AppApiEvent) => void): () => void;
}

export function createInMemoryTransport(server: AppApiServerLike): AppApiTransport {
  return {
    async call(method, params) {
      const result = await server.call(method, structuredClone(params));
      return structuredClone(result);
    },
    subscribe(onEvent) {
      return server.subscribe((event) => onEvent(structuredClone(event)));
    },
  };
}
