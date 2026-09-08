import {
  createScopedReactionWorkspacePair,
  type ScopedReactionWorkspacePair,
} from "../recovered/features/conversation/cards/transcript-card/reaction-workspace-handoff";
import {
  createReactionFeedAdapter,
  type ReactionFeedAdapter,
} from "../recovered/features/conversation/cards/transcript-card/reaction-feed";
import {
  createTranscriptFeedFanout,
  type TranscriptClientEventSource,
  type TranscriptFeedFanout,
} from "../recovered/features/conversation/cards/transcript-card/transcript-feed-source";
import type {
  ReactionActionScope,
  ReactionAuthoritativeUpdate,
  ReactionCallSource,
  ReactToMessageInput,
  TranscriptReaction,
} from "../recovered/features/conversation/cards/transcript-card/reaction-actions";
import type { ConversationTranscriptEntry } from "../recovered/features/conversation/workspace/model";

export interface ProductionReactionRootOptions {
  readonly source: (TranscriptClientEventSource & ReactionCallSource) | null | undefined;
  readonly scope: ReactionActionScope;
  readonly onReacted: (input: ReactToMessageInput) => void;
  readonly onAuthoritativeReactions: (update: ReactionAuthoritativeUpdate) => void;
  readonly onAuthoritativeCleared: (scope: ReactionActionScope) => void;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5068500 (reaction-pill toggle projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5076856 (quick-reaction dispatch ordering)
export function applyOptimisticReactionUpdate(
  entries: readonly ConversationTranscriptEntry[],
  input: Pick<ReactToMessageInput, "entryId" | "emoji">,
): readonly ConversationTranscriptEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    if (entry.id !== input.entryId || (entry.kind !== "message" && entry.kind !== "send-message")) return entry;
    if (entry.kind === "message" && (entry.delivery === "failed" || entry.delivery === "pending" || entry.delivery === "queued")) return entry;
    if (entry.kind === "send-message" && entry.draftSendState === "sending") return entry;
    const reactions: readonly TranscriptReaction[] = Array.isArray(entry.reactions) ? entry.reactions : [];
    const hasOwnReaction = reactions.some((reaction) => reaction.by === "me" && reaction.emoji === input.emoji);
    const nextReactions = hasOwnReaction
      ? reactions.filter((reaction) => !(reaction.by === "me" && reaction.emoji === input.emoji))
      : [...reactions, { emoji: input.emoji, by: "me" }];
    const myReactions = new Set(nextReactions.filter((reaction) => reaction.by === "me").map((reaction) => reaction.emoji));
    changed = true;
    return { ...entry, reactions: nextReactions, myReactions };
  });
  return changed ? next : entries;
}

export interface ProductionReactionRootScope {
  readonly feed: TranscriptFeedFanout;
  readonly pair: ScopedReactionWorkspacePair;
  readonly adapter: ReactionFeedAdapter;
  setScope(scope: ReactionActionScope): void;
  reconnect(): void;
  reset(): void;
  dispose(): void;
}

/**
 * Owns the one production reaction observer. The transcript fan-out is the
 * only client subscription; the adapter is the only feed observer, and no
 * transcript state or fallback fetcher is created here.
 */
export function createProductionReactionRootScope(
  options: ProductionReactionRootOptions,
): ProductionReactionRootScope | null {
  const feed = createTranscriptFeedFanout(options.source);
  if (feed == null) return null;
  const pair = createScopedReactionWorkspacePair({
    scope: options.scope,
    feed,
    source: options.source,
    onReacted: options.onReacted,
    onAuthoritativeReactions: options.onAuthoritativeReactions,
    onAuthoritativeCleared: options.onAuthoritativeCleared,
  });
  if (pair == null) {
    feed.dispose();
    return null;
  }
  const adapter = createReactionFeedAdapter({
    scope: options.scope,
    feed: pair.feed,
    controller: pair.controller,
  });
  let disposed = false;
  return {
    feed,
    pair,
    adapter,
    setScope(scope) {
      if (!disposed) adapter.setScope(scope);
    },
    reconnect() {
      if (!disposed) adapter.reconnect();
    },
    reset() {
      if (!disposed) adapter.reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      adapter.dispose();
      pair.controller.dispose();
      feed.dispose();
    },
  };
}
