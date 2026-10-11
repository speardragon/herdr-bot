/**
 * The renderer-facing half of the app API: a tiny typed client over an abstract transport. Zero
 * imports beyond this package's own dependency-free modules, so a renderer can bundle it directly.
 *
 * A transport just needs to move a method name + params to the host and get a result or error back,
 * plus deliver a stream of events -- see `AppApiTransport`. `desktop/src/preload.cts` implements one
 * over `ipcRenderer.invoke`/a push channel; `in-memory-transport.ts` implements one in-process for
 * tests (and for `createAppApiServer` itself, which already satisfies this shape).
 */
import { toAppApiError } from "./errors.ts";
import type { AppApiEvent, AppApiEventType, AppApiMethod, AppApiParams, AppApiResult } from "./types.ts";

export interface AppApiTransport {
  call(method: string, params: unknown): Promise<unknown>;
  /** Delivers every event, of every type, to `onEvent`; returns an unsubscribe function. */
  subscribe(onEvent: (event: AppApiEvent) => void): () => void;
}

export interface AppApiClient {
  call<M extends AppApiMethod>(method: M, params: AppApiParams<M>): Promise<AppApiResult<M>>;
  /** `types` is one event type, a list of them, or "*" for everything. Returns an unsubscribe function. */
  subscribe<K extends AppApiEventType>(types: K | readonly K[] | "*", listener: (event: AppApiEvent<K>) => void): () => void;
  /** The most recent event seq this client has observed, or null before the first event. Exposed mainly
   * for tests/diagnostics -- ordinary callers should rely on the `onResyncNeeded` gap callback instead. */
  lastSeq(): number | null;
}

export interface AppApiClientOptions {
  /** Called when an incoming event's seq is not exactly one more than the last one seen -- a missed
   * event (the transport dropped/reconnected). There is no replay: the caller should re-fetch whatever
   * it cares about (typically `chat.list`, and any open `transcript.page`) rather than trust local state. */
  readonly onResyncNeeded?: () => void;
}

function matches<K extends AppApiEventType>(types: K | readonly K[] | "*", type: AppApiEventType): type is K {
  if (types === "*") return true;
  return Array.isArray(types) ? (types as readonly string[]).includes(type) : types === type;
}

export function createAppClient(transport: AppApiTransport, options: AppApiClientOptions = {}): AppApiClient {
  let seen: number | null = null;

  transport.subscribe((event) => {
    if (seen !== null && event.seq !== seen + 1) options.onResyncNeeded?.();
    seen = event.seq;
  });

  return {
    async call(method, params) {
      try {
        return (await transport.call(method, params)) as never;
      } catch (error) {
        throw toAppApiError(error);
      }
    },
    subscribe(types, listener) {
      return transport.subscribe((event) => {
        if (matches(types, event.type)) listener(event as never);
      });
    },
    lastSeq() {
      return seen;
    },
  };
}
