// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=828382 (WMt snapshotsFor/retain provider)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4911773 (wSn full-conversation outline panel)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=1096467 (WMt snapshotsFor/retain provider)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6168984 (wSn full-conversation outline panel)

export type ConversationOutlineMessage =
  | { readonly type: "text"; readonly content: string }
  | { readonly type: "attachment"; readonly url: string; readonly alt?: string };

export type ConversationOutlineItem =
  | { readonly kind: "user"; readonly id: string; readonly text: string; readonly hidden?: true }
  | { readonly kind: "assistant-text"; readonly id: string; readonly text: string }
  | { readonly kind: "thinking"; readonly id: string; readonly text: string; readonly durationMs?: number }
  | { readonly kind: "send-message"; readonly id: string; readonly message: ConversationOutlineMessage }
  | {
    readonly kind: "tool-call";
    readonly id: string;
    readonly name: string;
    readonly status: "pending" | "failed" | "done";
    readonly summary?: string;
  };

export type ConversationOutlineEvent =
  | { readonly type: "snapshot"; readonly agentId: string; readonly items: readonly ConversationOutlineItem[] }
  | { readonly type: "appended"; readonly agentId: string; readonly item: ConversationOutlineItem }
  | { readonly type: "updated"; readonly agentId: string; readonly item: ConversationOutlineItem };

export type ConversationOutlineStatus = "idle" | "loading" | "ready" | "error";

export interface ConversationOutlineSnapshot {
  readonly accountKey: string | null;
  readonly agentId: string | null;
  readonly generation: number;
  readonly status: ConversationOutlineStatus;
  readonly items: readonly ConversationOutlineItem[];
  readonly error: unknown | null;
}

export interface ConversationOutlineRequestOptions {
  readonly signal?: AbortSignal;
}

/** The exact coordinator method seam: `{ id }` request, array reply, cancellable. */
export interface ConversationOutlineCoordinator {
  getConversationOutline(args: { readonly id: string }, options?: ConversationOutlineRequestOptions): Promise<unknown>;
}

export interface ConversationOutlineSubscription {
  dispose(): void;
}

export interface ConversationOutlineEventSource {
  subscribe(family: "outline", listener: (payload: unknown) => void): ConversationOutlineSubscription | (() => void);
  subscribeTransportState(listener: (state: "connected" | "down") => void): ConversationOutlineSubscription | (() => void);
}

export interface ConversationOutlineScheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ConversationOutlineProviderOptions {
  readonly coordinator: ConversationOutlineCoordinator;
  readonly events: ConversationOutlineEventSource;
  readonly scheduler?: ConversationOutlineScheduler;
  readonly accountKey?: string | null;
}

export interface ConversationOutlineSnapshotHandle {
  get(): ConversationOutlineSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface ConversationOutlineProvider {
  snapshotsFor(agentId: string): ConversationOutlineSnapshotHandle;
  retain(agentId: string, options?: { readonly pollIntervalMs?: number }): () => void;
  refresh(agentId: string): Promise<ConversationOutlineSnapshot>;
  setAccount(accountKey: string | null): void;
  reset(): void;
  dispose(): void;
}

const DEFAULT_SCHEDULER: ConversationOutlineScheduler = {
  setInterval(callback, intervalMs) {
    return globalThis.setInterval(callback, intervalMs);
  },
  clearInterval(handle) {
    globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>);
  },
};

const EMPTY_ITEMS: readonly ConversationOutlineItem[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseMessage(value: unknown): ConversationOutlineMessage | null {
  if (!isRecord(value) || (value.type !== "text" && value.type !== "attachment")) return null;
  if (value.type === "text") return typeof value.content === "string" ? { type: "text", content: value.content } : null;
  if (typeof value.url !== "string" || value.url.length === 0) return null;
  return {
    type: "attachment",
    url: value.url,
    ...(typeof value.alt === "string" && value.alt.length > 0 ? { alt: value.alt } : {}),
  };
}

function parseItem(value: unknown): ConversationOutlineItem | null {
  if (!isRecord(value) || !nonEmptyString(value.kind) || !nonEmptyString(value.id)) return null;
  switch (value.kind) {
    case "user":
      return typeof value.text === "string" ? { kind: "user", id: value.id, text: value.text, ...(value.hidden === true ? { hidden: true } : {}) } : null;
    case "assistant-text":
      return typeof value.text === "string" ? { kind: "assistant-text", id: value.id, text: value.text } : null;
    case "thinking":
      return typeof value.text === "string" && (value.durationMs === undefined || typeof value.durationMs === "number")
        ? { kind: "thinking", id: value.id, text: value.text, ...(typeof value.durationMs === "number" ? { durationMs: value.durationMs } : {}) }
        : null;
    case "send-message": {
      const message = parseMessage(value.message);
      return message == null
        ? null
        : { kind: "send-message", id: value.id, message };
    }
    case "tool-call":
      return nonEmptyString(value.name) && (value.status === "pending" || value.status === "failed" || value.status === "done") && (value.summary === undefined || typeof value.summary === "string")
        ? { kind: "tool-call", id: value.id, name: value.name, status: value.status, ...(typeof value.summary === "string" ? { summary: value.summary } : {}) }
        : null;
    default:
      return null;
  }
}

function parseSnapshotItems(value: unknown): ConversationOutlineItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(parseItem);
  return items.every((item): item is ConversationOutlineItem => item != null) ? items : null;
}

function parseEvent(value: unknown): ConversationOutlineEvent | null {
  if (!isRecord(value) || !nonEmptyString(value.agentId)) return null;
  if (value.type === "snapshot") {
    const items = parseSnapshotItems(value.items);
    return items == null ? null : { type: "snapshot", agentId: value.agentId, items };
  }
  if (value.type !== "appended" && value.type !== "updated") return null;
  const item = parseItem(value.item);
  return item == null ? null : { type: value.type, agentId: value.agentId, item };
}

function disposeSubscription(subscription: ConversationOutlineSubscription | (() => void)): void {
  if (typeof subscription === "function") subscription();
  else subscription.dispose();
}

function scopeKey(accountKey: string | null, agentId: string): string {
  return `${accountKey ?? ""}\u0000${agentId}`;
}

interface Entry {
  readonly accountKey: string | null;
  readonly agentId: string;
  generation: number;
  status: ConversationOutlineStatus;
  items: readonly ConversationOutlineItem[];
  error: unknown | null;
  requestGeneration: number;
  request: { readonly generation: number; readonly controller: AbortController; readonly promise: Promise<ConversationOutlineSnapshot> } | null;
  retainCount: number;
  pollIntervalMs: number | null;
  pollHandle: unknown;
  listeners: Set<() => void>;
  snapshot: ConversationOutlineSnapshot;
}

function makeSnapshot(entry: Entry): ConversationOutlineSnapshot {
  return {
    accountKey: entry.accountKey,
    agentId: entry.agentId,
    generation: entry.generation,
    status: entry.status,
    items: entry.items,
    error: entry.error,
  };
}

export function createConversationOutlineProvider(options: ConversationOutlineProviderOptions): ConversationOutlineProvider {
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const entries = new Map<string, Entry>();
  let accountKey = options.accountKey ?? null;
  let generation = 0;
  let disposed = false;

  const notify = (entry: Entry): void => {
    if (disposed) return;
    entry.snapshot = makeSnapshot(entry);
    for (const listener of [...entry.listeners]) listener();
  };
  const entryFor = (agentId: string): Entry => {
    const key = scopeKey(accountKey, agentId);
    const existing = entries.get(key);
    if (existing != null) return existing;
    const entry: Entry = {
      accountKey,
      agentId,
      generation,
      status: "idle",
      items: EMPTY_ITEMS,
      error: null,
      requestGeneration: 0,
      request: null,
      retainCount: 0,
      pollIntervalMs: null,
      pollHandle: null,
      listeners: new Set(),
      snapshot: {
        accountKey,
        agentId,
        generation,
        status: "idle",
        items: EMPTY_ITEMS,
        error: null,
      },
    };
    entries.set(key, entry);
    return entry;
  };
  const invalidateEntry = (entry: Entry, status: ConversationOutlineStatus = "idle"): void => {
    entry.requestGeneration += 1;
    entry.request?.controller.abort();
    entry.request = null;
    if (entry.pollHandle != null) scheduler.clearInterval(entry.pollHandle);
    entry.pollHandle = null;
    entry.pollIntervalMs = null;
    entry.generation = generation;
    entry.status = status;
    entry.items = EMPTY_ITEMS;
    entry.error = null;
    notify(entry);
  };
  const refreshEntry = (entry: Entry): Promise<ConversationOutlineSnapshot> => {
    if (disposed || entry.accountKey !== accountKey || entry.retainCount === 0) return Promise.resolve(entry.snapshot);
    if (entry.request != null) return entry.request.promise;
    const requestGeneration = ++entry.requestGeneration;
    const controller = new AbortController();
    entry.status = "loading";
    entry.error = null;
    notify(entry);
    const promise = (async (): Promise<ConversationOutlineSnapshot> => {
      try {
        const raw = await options.coordinator.getConversationOutline({ id: entry.agentId }, { signal: controller.signal });
        const items = parseSnapshotItems(raw);
        if (items == null) throw new Error("malformed conversation outline reply");
        if (disposed || entry.accountKey !== accountKey || entry.requestGeneration !== requestGeneration || entry.request?.controller !== controller) return entry.snapshot;
        entry.items = items;
        entry.status = "ready";
        entry.error = null;
        notify(entry);
        return entry.snapshot;
      } catch (error) {
        if (disposed || entry.accountKey !== accountKey || entry.requestGeneration !== requestGeneration || entry.request?.controller !== controller) return entry.snapshot;
        if (controller.signal.aborted) return entry.snapshot;
        entry.status = "error";
        entry.error = error;
        notify(entry);
        throw error;
      } finally {
        if (entry.request?.controller === controller) {
          entry.request = null;
          if (!disposed) notify(entry);
        }
      }
    })();
    entry.request = { generation: requestGeneration, controller, promise };
    return promise;
  };
  const refreshRetained = (): void => {
    for (const entry of entries.values()) if (entry.retainCount > 0) void refreshEntry(entry).catch(() => {});
  };
  const onEvent = (payload: unknown): void => {
    const event = parseEvent(payload);
    if (event == null || event.agentId.length === 0) return;
    const entry = entries.get(scopeKey(accountKey, event.agentId));
    if (entry == null || entry.retainCount === 0) return;
    if (event.type === "snapshot") {
      entry.items = event.items;
      entry.status = "ready";
      entry.error = null;
      notify(entry);
      return;
    }
    const item = event.item;
    const index = entry.items.findIndex((candidate) => candidate.id === item.id);
    entry.items = index < 0
      ? [...entry.items, item]
      : entry.items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
    entry.status = "ready";
    entry.error = null;
    notify(entry);
  };
  const outlineSubscription = options.events.subscribe("outline", onEvent);
  const transportSubscription = options.events.subscribeTransportState((state) => {
    if (state === "connected") refreshRetained();
    else for (const entry of entries.values()) {
      if (entry.retainCount === 0) continue;
      entry.status = "error";
      entry.error = new Error("coordinator transport unavailable");
      notify(entry);
    }
  });

  return {
    snapshotsFor(agentId) {
      const entry = entryFor(agentId);
      return {
        get: () => entry.snapshot,
        subscribe(listener) {
          if (disposed) return () => {};
          entry.listeners.add(listener);
          return () => entry.listeners.delete(listener);
        },
      };
    },
    retain(agentId, retainOptions) {
      if (disposed) return () => {};
      const entry = entryFor(agentId);
      entry.retainCount += 1;
      const pollIntervalMs = retainOptions?.pollIntervalMs;
      if (entry.pollHandle == null && Number.isSafeInteger(pollIntervalMs) && (pollIntervalMs ?? 0) > 0) {
        entry.pollIntervalMs = pollIntervalMs as number;
        entry.pollHandle = scheduler.setInterval(() => { void refreshEntry(entry).catch(() => {}); }, entry.pollIntervalMs);
      }
      void refreshEntry(entry).catch(() => {});
      let released = false;
      return () => {
        if (released || disposed) return;
        released = true;
        entry.retainCount = Math.max(0, entry.retainCount - 1);
        if (entry.retainCount === 0) {
          entry.requestGeneration += 1;
          entry.request?.controller.abort();
          entry.request = null;
          if (entry.pollHandle != null) scheduler.clearInterval(entry.pollHandle);
          entry.pollHandle = null;
          entry.pollIntervalMs = null;
        }
      };
    },
    refresh(agentId) {
      return refreshEntry(entryFor(agentId));
    },
    setAccount(nextAccountKey) {
      if (disposed || accountKey === nextAccountKey) return;
      generation += 1;
      for (const entry of entries.values()) invalidateEntry(entry);
      entries.clear();
      accountKey = nextAccountKey;
    },
    reset() {
      if (disposed) return;
      generation += 1;
      for (const entry of entries.values()) invalidateEntry(entry);
      entries.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeSubscription(outlineSubscription);
      disposeSubscription(transportSubscription);
      for (const entry of entries.values()) {
        entry.requestGeneration += 1;
        entry.request?.controller.abort();
        if (entry.pollHandle != null) scheduler.clearInterval(entry.pollHandle);
        entry.listeners.clear();
      }
      entries.clear();
    },
  };
}
