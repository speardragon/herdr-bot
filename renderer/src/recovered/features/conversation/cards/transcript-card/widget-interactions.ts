import type { TranscriptCardEntry, TranscriptCardScope } from "./protocol";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=824822 (respondToWidget/dismissWidget interaction provider)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5712387 (transcript action forwarding)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5566260 (coordinator method reply contracts)

export interface RespondToWidgetArgs {
  entryId: string;
  value: string;
  agentId: string;
}

export interface DismissWidgetArgs {
  entryId: string;
  agentId: string;
}

export interface WidgetActionReply {
  accepted: boolean;
}

export interface WidgetInteractionTransport {
  respondToWidget(args: RespondToWidgetArgs): Promise<WidgetActionReply | null>;
  dismissWidget(args: DismissWidgetArgs): Promise<WidgetActionReply>;
}

export interface WidgetInteractionCallSource {
  call(method: string, args?: unknown): Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function actionReply(value: unknown, method: string): WidgetActionReply | null {
  if (value == null) return null;
  if (!isRecord(value) || typeof value.accepted !== "boolean") throw new Error(`${method} returned a malformed widget reply`);
  return { accepted: value.accepted };
}

export function createWidgetInteractionTransport(source: WidgetInteractionCallSource): WidgetInteractionTransport {
  return {
    async respondToWidget(args) {
      return actionReply(await source.call("respondToWidget", args), "respondToWidget");
    },
    async dismissWidget(args) {
      const reply = actionReply(await source.call("dismissWidget", args), "dismissWidget");
      if (reply == null) throw new Error("dismissWidget returned no reply");
      return reply;
    },
  };
}

export type WidgetActionState = "idle" | "pending" | "answered" | "dismissed";

export interface WidgetActionSnapshot {
  readonly entryId: string;
  readonly replyToId: string | null;
  readonly scope: TranscriptCardScope;
  readonly state: WidgetActionState;
  readonly value: string | null;
}

export type WidgetActionResult =
  | { kind: "answered"; snapshot: WidgetActionSnapshot }
  | { kind: "dismissed"; snapshot: WidgetActionSnapshot }
  | { kind: "rolled-back"; snapshot: WidgetActionSnapshot }
  | { kind: "stale"; snapshot: WidgetActionSnapshot }
  | { kind: "ignored"; reason: "not-widget" | "settled" | "unavailable" };

export interface WidgetInteractionAdapterOptions {
  scope: TranscriptCardScope;
  transport: WidgetInteractionTransport;
}

export interface WidgetInteractionAdapter {
  getSnapshot(entryId: string): WidgetActionSnapshot;
  subscribe(listener: () => void): () => void;
  replaceEntries(entries: readonly TranscriptCardEntry[]): void;
  respond(entryId: string, value: string): Promise<WidgetActionResult>;
  dismiss(entryId: string): Promise<WidgetActionResult>;
  setScope(scope: TranscriptCardScope): void;
  dispose(): void;
}

function cloneScope(scope: TranscriptCardScope): TranscriptCardScope {
  return { accountSlot: scope.accountSlot, agentId: scope.agentId };
}

function emptySnapshot(entryId: string, scope: TranscriptCardScope, replyToId: string | null = null): WidgetActionSnapshot {
  return { entryId, replyToId, scope: cloneScope(scope), state: "idle", value: null };
}

function settledSnapshot(entry: TranscriptCardEntry, scope: TranscriptCardScope): WidgetActionSnapshot {
  if (entry.respondedValue != null) {
    return { entryId: entry.id, replyToId: entry.replyToId ?? null, scope: cloneScope(scope), state: "answered", value: entry.respondedValue };
  }
  if (entry.widgetDismissed === true) {
    return { entryId: entry.id, replyToId: entry.replyToId ?? null, scope: cloneScope(scope), state: "dismissed", value: null };
  }
  return emptySnapshot(entry.id, scope, entry.replyToId ?? null);
}

function sameScope(left: TranscriptCardScope, right: TranscriptCardScope): boolean {
  return left.accountSlot === right.accountSlot && left.agentId === right.agentId;
}

export function createWidgetInteractionAdapter(options: WidgetInteractionAdapterOptions): WidgetInteractionAdapter {
  let scope = cloneScope(options.scope);
  let entries = new Map<string, TranscriptCardEntry>();
  let snapshots = new Map<string, WidgetActionSnapshot>();
  let listeners = new Set<() => void>();
  let generation = 0;
  let disposed = false;

  const emit = () => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };
  const current = (entryId: string): WidgetActionSnapshot => snapshots.get(entryId) ?? emptySnapshot(entryId, scope, entries.get(entryId)?.replyToId ?? null);
  const isWidget = (entryId: string): TranscriptCardEntry | null => {
    const entry = entries.get(entryId);
    return entry?.message.type === "widget" ? entry : null;
  };

  const replaceEntries = (nextEntries: readonly TranscriptCardEntry[]) => {
    if (disposed) return;
    entries = new Map(nextEntries.filter((entry) => entry.message.type === "widget").map((entry) => [entry.id, entry]));
    const nextSnapshots = new Map<string, WidgetActionSnapshot>();
    for (const entry of entries.values()) nextSnapshots.set(entry.id, settledSnapshot(entry, scope));
    snapshots = nextSnapshots;
    emit();
  };

  const begin = (entryId: string): { entry: TranscriptCardEntry; token: number; before: WidgetActionSnapshot } | WidgetActionResult => {
    if (disposed || scope.agentId == null) return { kind: "ignored", reason: "unavailable" };
    const entry = isWidget(entryId);
    if (entry == null) return { kind: "ignored", reason: "not-widget" };
    const before = current(entryId);
    if (before.state !== "idle") return { kind: "ignored", reason: "settled" };
    const token = generation;
    snapshots.set(entryId, { ...before, state: "pending" });
    emit();
    return { entry, token, before };
  };

  const isCurrent = (entryId: string, token: number, actionScope: TranscriptCardScope): boolean => !disposed && token === generation && sameScope(actionScope, scope) && entries.has(entryId);
  const rollback = (entryId: string, before: WidgetActionSnapshot): WidgetActionResult => {
    snapshots.set(entryId, before);
    emit();
    return { kind: "rolled-back", snapshot: before };
  };

  return {
    getSnapshot(entryId) {
      return current(entryId);
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replaceEntries,
    async respond(entryId, value) {
      const started = begin(entryId);
      if ("kind" in started) return started;
      const trimmed = value.trim();
      if (trimmed.length === 0) return rollback(entryId, started.before);
      const actionScope = cloneScope(scope);
      try {
        const reply = await options.transport.respondToWidget({ entryId, value: trimmed, agentId: actionScope.agentId as string });
        if (!isCurrent(entryId, started.token, actionScope)) return { kind: "stale", snapshot: current(entryId) };
        if (reply?.accepted !== true) return rollback(entryId, started.before);
        const snapshot: WidgetActionSnapshot = { ...started.before, state: "answered", value: trimmed };
        snapshots.set(entryId, snapshot);
        emit();
        return { kind: "answered", snapshot };
      } catch {
        if (!isCurrent(entryId, started.token, actionScope)) return { kind: "stale", snapshot: current(entryId) };
        return rollback(entryId, started.before);
      }
    },
    async dismiss(entryId) {
      const started = begin(entryId);
      if ("kind" in started) return started;
      const actionScope = cloneScope(scope);
      try {
        const reply = await options.transport.dismissWidget({ entryId, agentId: actionScope.agentId as string });
        if (!isCurrent(entryId, started.token, actionScope)) return { kind: "stale", snapshot: current(entryId) };
        if (reply.accepted !== true) return rollback(entryId, started.before);
        const snapshot: WidgetActionSnapshot = { ...started.before, state: "dismissed", value: null };
        snapshots.set(entryId, snapshot);
        emit();
        return { kind: "dismissed", snapshot };
      } catch {
        if (!isCurrent(entryId, started.token, actionScope)) return { kind: "stale", snapshot: current(entryId) };
        return rollback(entryId, started.before);
      }
    },
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      generation += 1;
      scope = cloneScope(nextScope);
      entries = new Map();
      snapshots = new Map();
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      entries.clear();
      snapshots.clear();
      listeners.clear();
    },
  };
}
