import {
  createReactionActionController,
  createReactToMessageTransport,
  type ReactionActionController,
  type ReactionActionScope,
  type ReactionAuthoritativeUpdate,
  type ReactionCallSource,
} from "./reaction-actions";
import type { TranscriptFeedSource } from "./reaction-feed";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5295149 (transcript owner feed lifecycle)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=828343 (reactToMessage coordinator method)

/**
 * The workspace accepts this pair only when the root has supplied the real
 * transcript owner. The factory deliberately does not create a feed, fetch
 * transcript state, or keep an authoritative reaction store.
 */
export interface ScopedReactionWorkspacePair {
  readonly feed: TranscriptFeedSource;
  readonly controller: ReactionActionController;
}

export interface ScopedReactionWorkspacePairOptions {
  readonly scope: ReactionActionScope;
  readonly feed: TranscriptFeedSource | null | undefined;
  readonly source: ReactionCallSource | null | undefined;
  readonly onReacted: (input: import("./reaction-actions").ReactToMessageInput) => void;
  readonly onAuthoritativeReactions?: (update: ReactionAuthoritativeUpdate) => void;
  readonly onAuthoritativeCleared?: (scope: ReactionActionScope) => void;
}

function hasFeed(value: TranscriptFeedSource | null | undefined): value is TranscriptFeedSource {
  return typeof value?.observeEntriesFeed === "function";
}

function hasCallSource(value: ReactionCallSource | null | undefined): value is ReactionCallSource {
  return typeof value?.call === "function";
}

/**
 * Creates the exact pair consumed by ConversationWorkspaceController.
 *
 * A missing renderer transcript owner or coordinator call source returns null;
 * callers must leave reactions unmounted in that case. `feed` remains the
 * shipped owner and `source.call("reactToMessage", input)` remains the only
 * reaction transport.
 */
export function createScopedReactionWorkspacePair(
  options: ScopedReactionWorkspacePairOptions,
): ScopedReactionWorkspacePair | null {
  if (!hasFeed(options.feed) || !hasCallSource(options.source)) return null;

  return {
    feed: options.feed,
    controller: createReactionActionController({
      scope: options.scope,
      transport: createReactToMessageTransport(options.source),
      onReacted: options.onReacted,
      onAuthoritativeReactions: options.onAuthoritativeReactions,
      onAuthoritativeCleared: options.onAuthoritativeCleared,
    }),
  };
}
