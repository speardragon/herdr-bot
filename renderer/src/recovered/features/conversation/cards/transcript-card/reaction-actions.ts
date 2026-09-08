// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5083971 (myReactions projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5084026 (reactToMessage payload and swallowed failure)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=824996 (self-reaction identity: me)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=828343 (typed reactToMessage method)

export const SAND_REACTION_SELF = "me" as const;

export const QUICK_REACTION_EMOJIS = ["👍", "👎", "❤️", "😂", "🎉", "😮"] as const;

export interface TranscriptReaction {
  readonly emoji: string;
  readonly by: string;
}

export interface TranscriptReactionProjection {
  readonly reactions: readonly TranscriptReaction[];
  readonly myReactions: ReadonlySet<string>;
}

export interface ReactToMessageInput {
  readonly entryId: string;
  readonly emoji: string;
  readonly agentId: string;
}

export interface ReactToMessageTransport {
  reactToMessage(input: ReactToMessageInput): Promise<void>;
}

export interface ReactionCallSource {
  /** The literal method keeps the coordinator contract closed at compile time. */
  call(method: "reactToMessage", args: ReactToMessageInput): Promise<unknown>;
}

export function createReactToMessageTransport(source: ReactionCallSource): ReactToMessageTransport {
  return {
    async reactToMessage(input) {
      await source.call("reactToMessage", input);
    },
  };
}

export interface ReactionActionScope {
  readonly accountSlot: string | null;
  readonly agentId: string | null;
}

export interface ReactionActionControllerOptions {
  readonly scope: ReactionActionScope;
  readonly transport: ReactToMessageTransport;
  readonly onReacted: (input: ReactToMessageInput) => void;
  readonly onAuthoritativeReactions?: (update: ReactionAuthoritativeUpdate) => void;
  readonly onAuthoritativeCleared?: (scope: ReactionActionScope) => void;
}

export interface ReactionAuthoritativeUpdate {
  readonly scope: ReactionActionScope;
  readonly entryId: string;
  readonly projection: TranscriptReactionProjection;
}

export interface ReactionActionController {
  getScope(): ReactionActionScope;
  react(entryId: string, emoji: string): boolean;
  reconcile(entryId: string, value: unknown): boolean;
  clearAuthoritative(): boolean;
  setScope(scope: ReactionActionScope): void;
  dispose(): void;
}

function cloneScope(scope: ReactionActionScope): ReactionActionScope {
  return { accountSlot: scope.accountSlot, agentId: scope.agentId };
}

function sameScope(left: ReactionActionScope, right: ReactionActionScope): boolean {
  return left.accountSlot === right.accountSlot && left.agentId === right.agentId;
}

export function projectTranscriptReactions(value: unknown): TranscriptReactionProjection {
  if (!Array.isArray(value)) return { reactions: [], myReactions: new Set() };
  const reactions: TranscriptReaction[] = [];
  const myReactions = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate == null || Array.isArray(candidate)) continue;
    const reaction = candidate as { emoji?: unknown; by?: unknown };
    if (typeof reaction.emoji !== "string" || reaction.emoji.length === 0 || typeof reaction.by !== "string" || reaction.by.length === 0) continue;
    const projected = { emoji: reaction.emoji, by: reaction.by };
    reactions.push(projected);
    if (reaction.by === SAND_REACTION_SELF) myReactions.add(reaction.emoji);
  }
  return { reactions, myReactions };
}

export function createReactionActionController(options: ReactionActionControllerOptions): ReactionActionController {
  let scope = cloneScope(options.scope);
  let generation = 0;
  let disposed = false;

  return {
    getScope: () => cloneScope(scope),
    react(entryId, emoji) {
      const agentId = scope.agentId;
      if (disposed || agentId == null || entryId.length === 0 || emoji.length === 0) return false;
      const requestGeneration = generation;
      const requestScope = cloneScope(scope);
      const input = { entryId, emoji, agentId };
      // The immutable owner updates the projected reaction state immediately and
      // intentionally swallows transport failures; no error copy is introduced.
      options.onReacted(input);
      void options.transport.reactToMessage(input).catch(() => {
        if (disposed || requestGeneration !== generation || !sameScope(requestScope, scope)) return;
        // Failure remains intentionally silent, matching the shipped owner.
      });
      return true;
    },
    reconcile(entryId, value) {
      if (disposed || scope.agentId == null || entryId.length === 0) return false;
      options.onAuthoritativeReactions?.({
        scope: cloneScope(scope),
        entryId,
        projection: projectTranscriptReactions(value),
      });
      return true;
    },
    clearAuthoritative() {
      if (disposed || scope.agentId == null) return false;
      options.onAuthoritativeCleared?.(cloneScope(scope));
      return true;
    },
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      scope = cloneScope(nextScope);
      generation += 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
    },
  };
}
