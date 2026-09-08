import type {
  TranscriptFeedHandlers,
  TranscriptFeedSource,
} from "./reaction-feed";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5295149 (single transcript owner feed lifecycle)

export type TranscriptClientUnsubscribe = (() => void) | { dispose(): void };

/** The existing coordinator client's one shared event subscription surface. */
export interface TranscriptClientEventSource {
  subscribe(family: "transcript", listener: (value: unknown) => void): TranscriptClientUnsubscribe;
}

export interface TranscriptFeedFanout extends TranscriptFeedSource {
  /** Disposes the one underlying client subscription and all leaf observers. */
  dispose(): void;
}

interface TranscriptFeedSubscriber {
  readonly handlers: TranscriptFeedHandlers;
}

interface TranscriptEventRecord {
  readonly type?: unknown;
  readonly activeAgentId?: unknown;
  readonly agentId?: unknown;
  readonly owningAgentId?: unknown;
  readonly entries?: unknown;
  readonly entry?: unknown;
  readonly before?: unknown;
}

function asRecord(value: unknown): TranscriptEventRecord | null {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return null;
  return value as TranscriptEventRecord;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function entryHasIdentity(value: unknown): boolean {
  const record = asRecord(value);
  return record != null && nonEmptyString((record as { id?: unknown }).id);
}

function validEntries(value: unknown): readonly unknown[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  for (const entry of value) {
    if (!entryHasIdentity(entry)) return null;
    const id = (entry as { id: string }).id;
    if (ids.has(id)) return null;
    ids.add(id);
  }
  return value;
}

function eventAgentId(event: TranscriptEventRecord): string | null {
  return nonEmptyString(event.agentId)
    ? event.agentId
    : nonEmptyString(event.owningAgentId)
      ? event.owningAgentId
      : null;
}

function disposeSubscription(subscription: TranscriptClientUnsubscribe): void {
  if (typeof subscription === "function") subscription();
  else subscription.dispose();
}

/**
 * Adapts the existing single client transcript subscription into the shipped
 * observeEntriesFeed shape. It stores no entries and never subscribes once per
 * leaf observer; all observers share the one client listener.
 */
export function createTranscriptFeedFanout(
  source: TranscriptClientEventSource | null | undefined,
): TranscriptFeedFanout | null {
  if (typeof source?.subscribe !== "function") return null;

  const subscribers = new Set<TranscriptFeedSubscriber>();
  let disposed = false;
  let subscription: TranscriptClientUnsubscribe;

  const dispatch = (eventValue: unknown): void => {
    if (disposed) return;
    const event = asRecord(eventValue);
    if (event == null || typeof event.type !== "string") return;

    if (event.type === "snapshot") {
      if (!nonEmptyString(event.activeAgentId)) return;
      const entries = validEntries(event.entries);
      if (entries == null) return;
      for (const { handlers } of [...subscribers]) {
        handlers.onBaseline({ agentId: event.activeAgentId, entries });
      }
      return;
    }

    const agentId = eventAgentId(event);
    if (agentId == null) return;

    if (event.type === "appended") {
      if (!entryHasIdentity(event.entry)) return;
      for (const { handlers } of [...subscribers]) handlers.onAppended({ agentId, entry: event.entry });
      return;
    }

    if (event.type === "updated") {
      if (!entryHasIdentity(event.entry)) return;
      if (event.before !== undefined && !entryHasIdentity(event.before)) return;
      for (const { handlers } of [...subscribers]) handlers.onUpdated({
        agentId,
        ...(event.before === undefined ? {} : { before: event.before }),
        after: event.entry,
      });
      return;
    }

    if (event.type === "cleared") {
      for (const { handlers } of [...subscribers]) handlers.onCleared(agentId);
    }
  };

  try {
    subscription = source.subscribe("transcript", dispatch);
  } catch {
    return null;
  }

  return {
    observeEntriesFeed(handlers) {
      if (disposed) return () => {};
      const subscriber = { handlers };
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeSubscription(subscription);
      subscribers.clear();
    },
  };
}
