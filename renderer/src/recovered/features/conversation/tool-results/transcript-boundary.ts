import type {
  TranscriptFeedHandlers,
  TranscriptFeedSource,
} from "../cards/transcript-card/reaction-feed";
import type { ReactionActionScope } from "../cards/transcript-card/reaction-actions";
import type {
  ConversationTranscriptEntry,
  TranscriptToolCall,
} from "../workspace/model";
import {
  createClientSideToolResultMergeState,
  mergeClientSideToolResultUpdate,
  type ClientSideToolResultMergeState,
  type ClientSideToolUpdate,
} from "./proto-adapter";
import type { ToolResultCardSnapshot } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5295149 (single transcript feed baseline/update/clear owner)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3097937 (typed tool call carries toolCallId)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3102316 (typed tool result carries toolCallId)

export type TranscriptEntryProjector = (
  value: unknown,
  index: number,
  agentId: string,
) => ConversationTranscriptEntry | null;

export interface ToolResultTranscriptConsumerProps {
  readonly entries: readonly ConversationTranscriptEntry[];
  readonly getToolResult: (toolCallId: string) => ToolResultCardSnapshot | null;
}

export interface ScopedClientSideToolUpdate {
  readonly scope: ReactionActionScope;
  readonly generation: number;
  readonly update: ClientSideToolUpdate;
}

export interface ToolResultTranscriptSnapshot {
  readonly scope: ReactionActionScope;
  readonly generation: number;
  readonly entries: readonly ConversationTranscriptEntry[];
}

export interface ToolResultTranscriptBoundary {
  getSnapshot(): ToolResultTranscriptSnapshot;
  getConsumerProps(): ToolResultTranscriptConsumerProps;
  subscribe(listener: () => void): () => void;
  applyToolUpdate(input: ScopedClientSideToolUpdate): boolean;
  setScope(scope: ReactionActionScope): void;
  reconnect(): void;
  reset(): void;
  dispose(): void;
}

function cloneScope(scope: ReactionActionScope): ReactionActionScope {
  return { accountSlot: scope.accountSlot, agentId: scope.agentId };
}

function sameScope(left: ReactionActionScope, right: ReactionActionScope): boolean {
  return left.accountSlot === right.accountSlot && left.agentId === right.agentId;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function entryId(value: unknown): string | null {
  const candidate = record(value)?.id;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function toolCallId(update: ClientSideToolUpdate): string | null {
  const value = update.value as { toolCallId?: unknown };
  return typeof value.toolCallId === "string" && value.toolCallId.length > 0
    ? value.toolCallId
    : null;
}

function disposeSubscription(
  subscription: (() => void) | { dispose(): void } | null,
): void {
  if (typeof subscription === "function") subscription();
  else subscription?.dispose();
}

/**
 * Joins the existing generic transcript feed with an injected generated-tool
 * update channel. The boundary owns no client subscription and never creates
 * a transcript entry for a typed update without a matching generic row.
 */
export function createToolResultTranscriptBoundary(options: {
  readonly scope: ReactionActionScope;
  readonly feed: TranscriptFeedSource;
  readonly projectEntry: TranscriptEntryProjector;
}): ToolResultTranscriptBoundary {
  let scope = cloneScope(options.scope);
  let generation = 0;
  let disposed = false;
  let subscription: (() => void) | { dispose(): void } | null = null;
  let entries: ConversationTranscriptEntry[] = [];
  let toolStates = new Map<string, ClientSideToolResultMergeState>();
  const listeners = new Set<() => void>();

  const emit = () => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };

  const detach = () => {
    disposeSubscription(subscription);
    subscription = null;
  };

  const clearState = () => {
    entries = [];
    toolStates = new Map();
  };

  const projected = (values: readonly unknown[], agentId: string): ConversationTranscriptEntry[] => values
    .map((value, index) => options.projectEntry(value, index, agentId))
    .filter((value): value is ConversationTranscriptEntry => value != null);

  const entryWithResult = (
    entry: ConversationTranscriptEntry,
  ): ConversationTranscriptEntry => {
    if (entry.kind !== "tool-call") return entry;
    const snapshot = toolStates.get(entry.id)?.snapshot ?? null;
    const toolEntry = entry as TranscriptToolCall;
    if (snapshot == null) {
      if (toolEntry.toolResult == null) return entry;
      const { toolResult: _removed, ...withoutResult } = toolEntry;
      return withoutResult;
    }
    return { ...toolEntry, toolResult: snapshot };
  };

  const reapplyResults = () => {
    entries = entries.map(entryWithResult);
  };

  const accept = (eventGeneration: number, agentId: string): boolean => (
    !disposed
    && eventGeneration === generation
    && scope.agentId != null
    && scope.agentId === agentId
  );

  const onBaseline = (eventGeneration: number, input: { readonly agentId: string; readonly entries: readonly unknown[] }) => {
    if (!accept(eventGeneration, input.agentId)) return;
    entries = projected(input.entries, input.agentId).map(entryWithResult);
    emit();
  };

  const onAppend = (eventGeneration: number, input: { readonly agentId: string; readonly entry: unknown }) => {
    if (!accept(eventGeneration, input.agentId)) return;
    const projectedEntry = options.projectEntry(input.entry, entries.length, input.agentId);
    if (projectedEntry == null) return;
    const id = entryId(projectedEntry);
    if (id == null || entries.some(entry => entry.id === id)) return;
    entries = [...entries, entryWithResult(projectedEntry)];
    emit();
  };

  const onUpdate = (eventGeneration: number, input: { readonly agentId: string; readonly after: unknown }) => {
    if (!accept(eventGeneration, input.agentId)) return;
    const projectedEntry = options.projectEntry(input.after, 0, input.agentId);
    const id = entryId(projectedEntry);
    if (projectedEntry == null || id == null) return;
    const index = entries.findIndex(entry => entry.id === id);
    if (index < 0) return;
    const next = [...entries];
    next[index] = entryWithResult(projectedEntry);
    entries = next;
    emit();
  };

  const onClear = (eventGeneration: number, agentId: string) => {
    if (!accept(eventGeneration, agentId)) return;
    clearState();
    emit();
  };

  const connect = () => {
    if (disposed || scope.agentId == null || subscription != null) return;
    const eventGeneration = generation;
    const handlers: TranscriptFeedHandlers = {
      onBaseline: input => onBaseline(eventGeneration, input),
      onAppended: input => onAppend(eventGeneration, input),
      onUpdated: input => onUpdate(eventGeneration, input),
      onCleared: agentId => onClear(eventGeneration, agentId),
    };
    try {
      subscription = options.feed.observeEntriesFeed(handlers);
    } catch {
      subscription = null;
    }
  };

  const getToolResult = (id: string): ToolResultCardSnapshot | null => (
    id.length > 0 ? toolStates.get(id)?.snapshot ?? null : null
  );

  connect();

  return {
    getSnapshot: () => ({ scope: cloneScope(scope), generation, entries: [...entries] }),
    getConsumerProps: () => ({ entries: [...entries], getToolResult }),
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyToolUpdate(input) {
      if (disposed) return false;
      if (input.generation !== generation || !sameScope(scope, input.scope)) return false;
      const update = input.update;
      const id = toolCallId(update);
      if (id == null) return false;
      const current = toolStates.get(id) ?? createClientSideToolResultMergeState();
      const next = mergeClientSideToolResultUpdate(current, update);
      if (next === current) return false;
      toolStates = new Map(toolStates);
      toolStates.set(id, next);
      reapplyResults();
      emit();
      return next.snapshot != null;
    },
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      generation += 1;
      detach();
      scope = cloneScope(nextScope);
      clearState();
      connect();
      emit();
    },
    reconnect() {
      if (disposed) return;
      generation += 1;
      detach();
      connect();
    },
    reset() {
      if (disposed) return;
      generation += 1;
      detach();
      clearState();
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      detach();
      clearState();
      listeners.clear();
    },
  };
}
