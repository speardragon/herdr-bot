import {
  type ReactionActionController,
  type ReactionActionScope,
} from "./reaction-actions";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5295149 (observeEntriesFeed baseline/update/clear lifecycle)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5076856 (optimistic reaction dispatch ordering)

export interface TranscriptFeedBaseline {
  readonly agentId: string;
  readonly entries: readonly unknown[];
}

export interface TranscriptFeedUpdate {
  readonly agentId: string;
  readonly before?: unknown;
  readonly after: unknown;
}

export interface TranscriptFeedHandlers {
  onBaseline(input: TranscriptFeedBaseline): void;
  onAppended(input: { readonly agentId: string; readonly entry: unknown }): void;
  onUpdated(input: TranscriptFeedUpdate): void;
  onCleared(agentId: string): void;
}

export interface TranscriptFeedSource {
  observeEntriesFeed(handlers: TranscriptFeedHandlers): (() => void) | { dispose(): void };
}

export interface ReactionFeedAdapterOptions {
  readonly scope: ReactionActionScope;
  readonly feed: TranscriptFeedSource;
  readonly controller: Pick<ReactionActionController, "reconcile" | "clearAuthoritative" | "setScope">;
}

export interface ReactionFeedAdapter {
  getScope(): ReactionActionScope;
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

function entryId(value: unknown): string | null {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function entryReactions(value: unknown): unknown {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return undefined;
  return (value as { reactions?: unknown }).reactions;
}

function reactionFingerprint(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate == null || Array.isArray(candidate)) return [];
    const reaction = candidate as { emoji?: unknown; by?: unknown };
    return typeof reaction.emoji === "string" && reaction.emoji.length > 0 && typeof reaction.by === "string" && reaction.by.length > 0
      ? [`${reaction.emoji}\u0000${reaction.by}`]
      : [];
  }).join("\u0001");
}

function disposeSubscription(subscription: (() => void) | { dispose(): void } | null): void {
  if (typeof subscription === "function") subscription();
  else subscription?.dispose();
}

export function createReactionFeedAdapter(options: ReactionFeedAdapterOptions): ReactionFeedAdapter {
  let scope = cloneScope(options.scope);
  let generation = 0;
  let disposed = false;
  let subscription: (() => void) | { dispose(): void } | null = null;
  const fingerprints = new Map<string, string>();

  const detach = () => {
    disposeSubscription(subscription);
    subscription = null;
  };

  const accept = (eventGeneration: number, agentId: string): boolean => (
    !disposed && eventGeneration === generation && scope.agentId != null && agentId === scope.agentId
  );

  const replace = (eventGeneration: number, agentId: string, value: unknown) => {
    if (!accept(eventGeneration, agentId)) return;
    const id = entryId(value);
    if (id == null) return;
    const rawReactions = entryReactions(value);
    const fingerprint = reactionFingerprint(rawReactions);
    if (fingerprints.get(id) === fingerprint) return;
    if (!options.controller.reconcile(id, rawReactions)) return;
    fingerprints.set(id, fingerprint);
  };

  const connect = () => {
    if (disposed || scope.agentId == null || subscription != null) return;
    const eventGeneration = generation;
    subscription = options.feed.observeEntriesFeed({
      onBaseline: (input) => {
        if (!accept(eventGeneration, input.agentId)) return;
        for (const entry of input.entries) replace(eventGeneration, input.agentId, entry);
      },
      onAppended: (input) => replace(eventGeneration, input.agentId, input.entry),
      onUpdated: (input) => replace(eventGeneration, input.agentId, input.after),
      onCleared: (agentId) => {
        if (!accept(eventGeneration, agentId)) return;
        fingerprints.clear();
        options.controller.clearAuthoritative();
      },
    });
  };

  options.controller.setScope(scope);
  connect();
  return {
    getScope: () => cloneScope(scope),
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      generation += 1;
      detach();
      fingerprints.clear();
      scope = cloneScope(nextScope);
      options.controller.setScope(scope);
      connect();
    },
    reconnect() {
      if (disposed) return;
      generation += 1;
      detach();
      fingerprints.clear();
      connect();
    },
    reset() {
      if (disposed) return;
      generation += 1;
      detach();
      fingerprints.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      detach();
      fingerprints.clear();
    },
  };
}
