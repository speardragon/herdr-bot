import type { ConversationTranscriptEntry } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5277800
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5282052
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5270639

export interface FindInChatScope {
  accountSlot: string | null;
  agentId: string | null;
}

export interface FindInChatMatch {
  entryId: string;
  occurrence: number;
}

export interface FindInChatSnapshot {
  readonly generation: number;
  readonly scope: FindInChatScope;
  readonly query: string;
  readonly matches: readonly FindInChatMatch[];
  readonly current: FindInChatMatch | null;
}

export interface FindInChatControllerOptions {
  scope?: FindInChatScope;
  onNavigate?(match: FindInChatMatch, index: number): void;
}

export interface FindInChatController {
  getSnapshot(): FindInChatSnapshot;
  subscribe(listener: () => void): () => void;
  replaceEntries(entries: readonly ConversationTranscriptEntry[]): void;
  setQuery(query: string): void;
  step(delta: 1 | -1): FindInChatMatch | null;
  close(): void;
  setScope(accountSlot: string | null, agentId: string | null): void;
  dispose(): void;
}

/** Immutable transcript handle consumed by the root-owned find leaf. */
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5270639
export interface FindInChatTranscriptHandle {
  scrollToEntryWithoutHighlight(entryId: string): void | boolean;
  subscribeViewCommits(listener: () => void): () => void;
}

function cloneScope(scope: FindInChatScope): FindInChatScope {
  return { accountSlot: scope.accountSlot, agentId: scope.agentId };
}

function searchableText(entry: ConversationTranscriptEntry): string {
  switch (entry.kind) {
    case "message": return entry.text;
    case "send-message": {
      // The shipped find projection searches the user-visible payload of the
      // supported send-message cards, but deliberately ignores action-only
      // cards and other transcript rows.
      switch (entry.message.type) {
        case "text": return entry.message.content;
        case "widget": return entry.message.widget.prompt;
        case "email-draft": return `${entry.message.draft.subject}\n${entry.message.draft.body}`;
        case "slack-draft": return entry.message.draft.body;
        default: return "";
      }
    }
    case "notice": return entry.text;
    default: return "";
  }
}

function projectMatches(entries: readonly ConversationTranscriptEntry[], query: string): FindInChatMatch[] {
  const needle = query.toLowerCase();
  if (query.trim().length === 0) return [];
  const matches: FindInChatMatch[] = [];
  for (const entry of entries) {
    const text = searchableText(entry).toLowerCase();
    if (text.length < needle.length) continue;
    let occurrence = 0;
    let at = text.indexOf(needle);
    while (at >= 0) {
      matches.push({ entryId: entry.id, occurrence });
      occurrence += 1;
      at = text.indexOf(needle, at + needle.length);
    }
  }
  return matches;
}

function sameMatch(left: FindInChatMatch | null, right: FindInChatMatch | null): boolean {
  return left?.entryId === right?.entryId && left?.occurrence === right?.occurrence;
}

export function createFindInChatController(options: FindInChatControllerOptions = {}): FindInChatController {
  const listeners = new Set<() => void>();
  let scope = cloneScope(options.scope ?? { accountSlot: null, agentId: null });
  let entries: readonly ConversationTranscriptEntry[] = [];
  let query = "";
  let matches: readonly FindInChatMatch[] = [];
  let current: FindInChatMatch | null = null;
  let generation = 0;
  let disposed = false;
  const readSnapshot = (): FindInChatSnapshot => ({ generation, scope: cloneScope(scope), query, matches, current });
  let snapshot = readSnapshot();
  const refreshSnapshot = () => { snapshot = readSnapshot(); };

  const emit = () => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };
  const recompute = () => {
    const nextMatches = projectMatches(entries, query);
    const retained = nextMatches.find((match) => sameMatch(match, current)) ?? null;
    matches = nextMatches;
    current = retained;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replaceEntries(nextEntries) {
      if (disposed) return;
      entries = [...nextEntries];
      recompute();
      refreshSnapshot();
      emit();
    },
    setQuery(nextQuery) {
      if (disposed || query === nextQuery) return;
      query = nextQuery;
      current = null;
      recompute();
      refreshSnapshot();
      emit();
    },
    step(delta) {
      if (disposed || matches.length === 0) return null;
      const currentIndex = current == null
        ? matches.length - 1
        : Math.max(0, matches.findIndex((match) => sameMatch(match, current)));
      const index = (currentIndex + delta + matches.length) % matches.length;
      const next = matches[index] ?? null;
      current = next;
      if (next != null) options.onNavigate?.(next, index);
      refreshSnapshot();
      emit();
      return next;
    },
    close() {
      if (disposed) return;
      query = "";
      matches = [];
      current = null;
      refreshSnapshot();
      emit();
    },
    setScope(accountSlot, agentId) {
      if (disposed || (scope.accountSlot === accountSlot && scope.agentId === agentId)) return;
      generation += 1;
      scope = { accountSlot, agentId };
      entries = [];
      query = "";
      matches = [];
      current = null;
      refreshSnapshot();
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      entries = [];
      query = "";
      matches = [];
      current = null;
      refreshSnapshot();
      listeners.clear();
    }
  };
}

export function findInChatSearchText(entry: ConversationTranscriptEntry): string {
  return searchableText(entry);
}
