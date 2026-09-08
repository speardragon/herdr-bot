import type { RawPortCoordinatorSource } from "../../../runtime/coordinator-source";
import {
  searchEmoji,
  type EmojiCatalog,
  type EmojiEntry,
} from "../cards/transcript-card/emoji-catalog";

// Immutable prompt suggestion contracts:
// Mac index-UbX-y3il.js (SHA-256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa):
// Q5n/j5n/$5n mention projection and keyboard rows bytes 4508081-4509612,
// emoji recents/catalog identity bytes 4511230-4512571, and hft extension wiring
// bytes 4528685-4731306.
// Windows index-UbX-y3il.js (SHA-256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5):
// corresponding mention bytes 5665060-5666823, emoji bytes 5666823-5680845,
// and hft extension wiring begins at byte 5691168.
// e9n prompt parent contract: Mac bytes 4731306-4777997 (region SHA-256
// cc04759018e4369c55cf92b7307acb35e4b43a7f14849e783bec9485436ed546), Windows
// byte 5948307; the parent supplies getMentionMembers/getWorkflows/getAppActions,
// getPrReferences/getMcpReferences and resolveSkillIcon. The current production
// renderer has no producer for the latter three callback families.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4508081
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4511230
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4528685
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4731306
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5665060
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5666823
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5691168
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5948307

export type EditorSuggestionCategory = "assistants" | "automations" | "tools";

export interface EditorSuggestionIcon {
  readonly type: "everyone" | "group" | "agent" | "tool";
  readonly fallback?: "clock" | "plug";
  readonly iconId?: string;
  readonly iconUrl?: string;
}

export interface EditorMentionSuggestion {
  readonly key: string;
  readonly id: string;
  readonly category: "assistants";
  readonly label: string;
  readonly subtitle?: string;
  readonly keywords: readonly string[];
  readonly icon: EditorSuggestionIcon;
  readonly isGroup: boolean;
  readonly insert: { readonly type: "mention"; readonly id: string; readonly label: string };
}

export interface EditorWorkflowSuggestion {
  readonly key: string;
  readonly id: string;
  readonly category: "automations";
  readonly label: string;
  readonly subtitle?: string;
  readonly keywords: readonly string[];
  readonly trigger: { readonly schedule: string; readonly isEnabled: boolean } | null;
  readonly icon: EditorSuggestionIcon;
  readonly insert: { readonly type: "workflow"; readonly id: string; readonly label: string; readonly iconId?: string; readonly iconUrl?: string };
}

export interface EditorMcpSuggestion {
  readonly key: string;
  readonly id: string;
  readonly category: "tools";
  readonly label: string;
  readonly subtitle?: string;
  readonly keywords: readonly string[];
  readonly icon: EditorSuggestionIcon;
  readonly insert: { readonly type: "workflow"; readonly id: string; readonly label: string; readonly iconId?: string; readonly iconUrl?: string };
}

export type EditorSuggestionEntry = EditorMentionSuggestion | EditorWorkflowSuggestion | EditorMcpSuggestion;
export type EditorSuggestionInsert = EditorSuggestionEntry["insert"];

export interface EditorSuggestionRecents {
  readonly mention: readonly { readonly category: EditorSuggestionCategory; readonly id: string }[];
  readonly emoji: readonly string[];
  recordMention?(value: { readonly category: EditorSuggestionCategory; readonly id: string }): void;
  recordEmoji?(id: string): void;
}

export interface EditorSuggestionSource extends Pick<RawPortCoordinatorSource, "listAgents" | "getAgentWorkflows"> {
  readonly subscribeTransportState?: RawPortCoordinatorSource["subscribeTransportState"];
}

export type EditorSuggestionSnapshot =
  | { readonly status: "idle"; readonly entries: readonly EditorSuggestionEntry[]; readonly prReferences: readonly never[] }
  | { readonly status: "loading"; readonly entries: readonly EditorSuggestionEntry[]; readonly prReferences: readonly never[] }
  | { readonly status: "ready"; readonly entries: readonly EditorSuggestionEntry[]; readonly prReferences: readonly never[] }
  | { readonly status: "empty"; readonly entries: readonly []; readonly prReferences: readonly never[] }
  | { readonly status: "failed"; readonly entries: readonly EditorSuggestionEntry[]; readonly prReferences: readonly never[]; readonly error: unknown }
  | { readonly status: "unavailable"; readonly entries: readonly []; readonly prReferences: readonly never[] }
  | { readonly status: "cancelled"; readonly entries: readonly EditorSuggestionEntry[]; readonly prReferences: readonly never[] };

export interface EditorSuggestionController {
  getSnapshot(): EditorSuggestionSnapshot;
  subscribe(listener: () => void): () => void;
  setScope(scope: { readonly accountKey: string | null; readonly agentId: string | null; readonly allowEveryone?: boolean }, recents?: Partial<EditorSuggestionRecents>): void;
  refresh(): Promise<EditorSuggestionSnapshot>;
  mentionRows(query: string): readonly EditorSuggestionEntry[];
  workflowRows(query: string): readonly EditorWorkflowSuggestion[];
  emojiRows(catalog: EmojiCatalog | null, query: string, limit?: number): readonly EmojiEntry[];
  recordMentionRecent(entry: EditorSuggestionEntry): void;
  recordEmojiRecent(id: string): void;
  reset(): void;
  dispose(): void;
}

const EVERYONE_ID = "__everyone__";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function projectTrigger(value: unknown): { readonly schedule: string; readonly isEnabled: boolean } | null {
  if (!isRecord(value) || typeof value.schedule !== "string" || typeof value.isEnabled !== "boolean") return null;
  return { schedule: value.schedule, isEnabled: value.isEnabled };
}

function projectWorkflow(value: unknown): EditorWorkflowSuggestion | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  if (id == null || name == null) return null;
  const trigger = projectTrigger(value.trigger);
  if ("trigger" in value && value.trigger !== null && trigger == null) return null;
  const scheduleDescription = nonEmptyString(value.scheduleDescription);
  const iconId = nonEmptyString(value.iconId);
  const iconUrl = nonEmptyString(value.iconUrl);
  return {
    key: `automations:${id}`,
    id,
    category: "automations",
    label: name,
    ...(scheduleDescription == null ? {} : { subtitle: scheduleDescription }),
    keywords: [name, scheduleDescription ?? ""].filter((entry) => entry.length > 0),
    trigger,
    icon: iconId != null || iconUrl != null
      ? { type: "tool", ...(iconId == null ? {} : { iconId }), ...(iconUrl == null ? {} : { iconUrl }) }
      : { type: "tool", fallback: "clock" },
    insert: {
      type: "workflow",
      id,
      label: name,
      ...(iconId == null ? {} : { iconId }),
      ...(iconUrl == null ? {} : { iconUrl }),
    },
  };
}

/** Projects only the trusted, renderer-safe member fields from listAgents. */
export function projectMentionMembers(value: unknown, allowEveryone = true): EditorMentionSuggestion[] {
  if (!Array.isArray(value)) return [];
  const result: EditorMentionSuggestion[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const id = nonEmptyString(candidate.id);
    const label = nonEmptyString(candidate.name);
    if (id == null || label == null || seen.has(id)) continue;
    if (candidate.isHiddenFromSidebar === true || candidate.hiddenFromSidebar === true) continue;
    seen.add(id);
    const members = stringArray(candidate.memberIds ?? candidate.members);
    const isGroup = candidate.isGroup === true;
    result.push({
      key: `assistants:${id}`,
      id,
      category: "assistants",
      label,
      ...(isGroup && members.length > 0 ? { subtitle: `${members.length} agents` } : {}),
      keywords: [label, typeof candidate.title === "string" ? candidate.title : ""].filter((entry) => entry.length > 0),
      icon: isGroup ? { type: "group" } : { type: "agent" },
      isGroup,
      insert: { type: "mention", id, label },
    });
  }
  if (allowEveryone && result.length >= 2) {
    result.unshift({
      key: `assistants:${EVERYONE_ID}`,
      id: EVERYONE_ID,
      category: "assistants",
      label: "everyone",
      keywords: ["everyone", "all"],
      icon: { type: "everyone" },
      isGroup: false,
      insert: { type: "mention", id: EVERYONE_ID, label: "everyone" },
    });
  }
  return result;
}

export function projectWorkflowSuggestions(value: unknown): EditorWorkflowSuggestion[] {
  if (!Array.isArray(value)) return [];
  const result: EditorWorkflowSuggestion[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const workflow = projectWorkflow(candidate);
    if (workflow == null || seen.has(workflow.id)) continue;
    seen.add(workflow.id);
    result.push(workflow);
  }
  return result;
}

function recencyKey(entry: EditorSuggestionEntry): string {
  return `${entry.category}:${entry.id}`;
}

function normalizeSuggestionText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function fuzzySuggestionScore(value: string, token: string): number | null {
  if (token.length === 0) return 0;
  const lower = value.toLowerCase();
  let score = 0;
  let matched = 0;
  let first = -1;
  let last = -1;
  for (let index = 0; index < lower.length && matched < token.length; index += 1) {
    if (lower[index] !== token[matched]) continue;
    if (first < 0) first = index;
    const previous = index === 0 ? "" : value[index - 1]!;
    const boundary = index === 0 || previous === " " || previous === "-" || previous === "_" || previous === "/" || previous === ".";
    const camelBoundary = previous >= "a" && previous <= "z" && value[index]! >= "A" && value[index]! <= "Z";
    let weight = 1;
    if (boundary || camelBoundary) weight += 4;
    if (last === index - 1) weight += 3;
    score += weight;
    last = index;
    matched += 1;
  }
  if (matched < token.length || last - first + 1 > token.length * 3) return null;
  return score - first * 0.1 - value.length * 0.02;
}

function entryScore(entry: EditorSuggestionEntry, query: string): number | null {
  const normalizedQuery = normalizeSuggestionText(query);
  if (normalizedQuery.length === 0) return 0;
  const tokens = normalizedQuery.split(" ");
  const candidates = [entry.label, entry.subtitle ?? "", ...entry.keywords];
  let score = 0;
  for (const token of tokens) {
    let best: number | null = null;
    for (const candidate of candidates) {
      const next = fuzzySuggestionScore(normalizeSuggestionText(candidate), token);
      if (next != null && (best == null || next > best)) best = next;
    }
    if (best == null) return null;
    score += best;
  }
  return score + (fuzzySuggestionScore(normalizeSuggestionText(entry.label), normalizedQuery) ?? 0);
}

/** Exact first-seen dedupe plus recent-first ranking used by the shipped rows. */
export function filterEditorSuggestionEntries(entries: readonly EditorSuggestionEntry[], query: string, recentKeys: readonly string[] = []): EditorSuggestionEntry[] {
  const seen = new Set<string>();
  const unique = entries.filter((entry) => {
    const key = recencyKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return entryScore(entry, query) != null;
  });
  const recent = new Map<string, number>();
  recentKeys.forEach((key, index) => { if (!recent.has(key)) recent.set(key, index); });
  const scores = new Map(unique.map((entry) => [recencyKey(entry), entryScore(entry, query) ?? 0]));
  const normalizedQuery = normalizeSuggestionText(query);
  if (normalizedQuery.length === 0) {
    return unique.sort((left, right) => (recent.get(recencyKey(left)) ?? Number.POSITIVE_INFINITY) - (recent.get(recencyKey(right)) ?? Number.POSITIVE_INFINITY));
  }
  return unique.sort((left, right) => {
    const scoreDifference = (scores.get(recencyKey(right)) ?? 0) - (scores.get(recencyKey(left)) ?? 0);
    if (scoreDifference !== 0) return scoreDifference;
    const recencyDifference = (recent.get(recencyKey(right)) ?? -1) - (recent.get(recencyKey(left)) ?? -1);
    return recencyDifference;
  });
}

export function selectEditorSuggestion(entries: readonly EditorSuggestionEntry[], activeIndex: number, key: string): { readonly kind: "move"; readonly activeIndex: number } | { readonly kind: "select"; readonly entry: EditorSuggestionEntry } | { readonly kind: "dismiss" } | { readonly kind: "noop" } {
  if (entries.length === 0) return key === "Escape" ? { kind: "dismiss" } : { kind: "noop" };
  if (key === "ArrowDown" || key === "ArrowUp") {
    const delta = key === "ArrowDown" ? 1 : -1;
    return { kind: "move", activeIndex: (Math.max(0, activeIndex) + delta + entries.length) % entries.length };
  }
  if (key === "Enter" || key === "Tab") return { kind: "select", entry: entries[Math.min(Math.max(activeIndex, 0), entries.length - 1)]! };
  return key === "Escape" ? { kind: "dismiss" } : { kind: "noop" };
}

/** PR candidates have no coordinator/bridge producer in the current renderer. */
export function pullRequestSuggestionRows(): readonly never[] {
  return [];
}

function previousEntries(snapshot: EditorSuggestionSnapshot): readonly EditorSuggestionEntry[] {
  return snapshot.status === "empty" || snapshot.status === "unavailable" ? [] : snapshot.entries;
}

function isUnavailable(error: unknown): boolean {
  return isRecord(error) && error.code === "source/capability-unavailable";
}

export function createEditorSuggestionController(source: EditorSuggestionSource): EditorSuggestionController {
  const listeners = new Set<() => void>();
  let snapshot: EditorSuggestionSnapshot = { status: "idle", entries: [], prReferences: [] };
  let accountKey: string | null = null;
  let agentId: string | null = null;
  let allowEveryone = true;
  let mentionRecents: { category: EditorSuggestionCategory; id: string }[] = [];
  let emojiRecents: string[] = [];
  let onRecordMention: EditorSuggestionRecents["recordMention"];
  let onRecordEmoji: EditorSuggestionRecents["recordEmoji"];
  let scopeGeneration = 0;
  let requestGeneration = 0;
  let controller: AbortController | null = null;
  let disposed = false;
  const unsubscribeTransport = source.subscribeTransportState?.((state) => {
    if (disposed || state === "connected") return;
    requestGeneration += 1;
    controller?.abort();
    controller = null;
    publish({ status: "unavailable", entries: [], prReferences: [] });
  });

  function publish(next: EditorSuggestionSnapshot): void {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }
  function isCurrent(scope: number, request: number): boolean {
    return !disposed && scope === scopeGeneration && request === requestGeneration;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(scope, recents = {}) {
      if (disposed) return;
      scopeGeneration += 1;
      requestGeneration += 1;
      controller?.abort();
      controller = null;
      accountKey = scope.accountKey;
      agentId = scope.agentId;
      allowEveryone = scope.allowEveryone ?? true;
      mentionRecents = (recents.mention ?? []).filter((entry) => typeof entry.id === "string" && typeof entry.category === "string").map((entry) => ({ category: entry.category!, id: entry.id }));
      emojiRecents = (recents.emoji ?? []).filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
      onRecordMention = recents.recordMention;
      onRecordEmoji = recents.recordEmoji;
      publish(accountKey == null || agentId == null ? { status: "unavailable", entries: [], prReferences: [] } : { status: "idle", entries: [], prReferences: [] });
    },
    async refresh() {
      if (disposed || accountKey == null || agentId == null) return { status: "unavailable", entries: [], prReferences: [] };
      controller?.abort();
      const nextController = new AbortController();
      controller = nextController;
      const scope = scopeGeneration;
      const request = ++requestGeneration;
      const previous = previousEntries(snapshot);
      publish({ status: "loading", entries: previous, prReferences: [] });
      try {
        const [members, workflows] = await Promise.all([
          source.listAgents({ signal: nextController.signal }),
          source.getAgentWorkflows({ id: agentId }, { signal: nextController.signal }),
        ]);
        if (!isCurrent(scope, request) || nextController.signal.aborted) return { status: "cancelled", entries: previous, prReferences: [] };
        const mentionMembers = projectMentionMembers(members, allowEveryone);
        const workflowEntries = projectWorkflowSuggestions(workflows);
        const entries = [...mentionMembers, ...workflowEntries];
        const next: EditorSuggestionSnapshot = entries.length === 0 ? { status: "empty", entries: [], prReferences: [] } : { status: "ready", entries, prReferences: [] };
        publish(next);
        return next;
      } catch (error) {
        if (!isCurrent(scope, request) || nextController.signal.aborted) return { status: "cancelled", entries: previous, prReferences: [] };
        const next: EditorSuggestionSnapshot = isUnavailable(error) ? { status: "unavailable", entries: [], prReferences: [] } : { status: "failed", entries: previous, prReferences: [], error };
        publish(next);
        return next;
      } finally {
        if (controller === nextController) controller = null;
      }
    },
    mentionRows(query) {
      return filterEditorSuggestionEntries(snapshot.entries.filter((entry) => entry.category === "assistants" || entry.category === "automations" && entry.trigger != null), query, mentionRecents.map((entry) => `${entry.category}:${entry.id}`));
    },
    workflowRows(query) {
      return filterEditorSuggestionEntries(snapshot.entries.filter((entry): entry is EditorWorkflowSuggestion => entry.category === "automations" && entry.trigger == null), query, mentionRecents.map((entry) => `${entry.category}:${entry.id}`)).filter((entry): entry is EditorWorkflowSuggestion => entry.category === "automations");
    },
    emojiRows(catalog, query, limit = 96) {
      if (catalog == null) return [];
      const recentEntries = emojiRecents.flatMap((id) => catalog.categories.flatMap((category) => category.emojis.filter((emoji) => emoji.id === id)));
      return searchEmoji(catalog, query, limit, recentEntries);
    },
    recordMentionRecent(entry) {
      if (disposed) return;
      const value = { category: entry.category, id: entry.id };
      mentionRecents = [value, ...mentionRecents.filter((candidate) => candidate.category !== value.category || candidate.id !== value.id)].slice(0, 20);
      onRecordMention?.(value);
    },
    recordEmojiRecent(id) {
      if (disposed || id.length === 0) return;
      emojiRecents = [id, ...emojiRecents.filter((candidate) => candidate !== id)].slice(0, 50);
      onRecordEmoji?.(id);
    },
    reset() {
      if (disposed) return;
      scopeGeneration += 1;
      requestGeneration += 1;
      controller?.abort();
      controller = null;
      accountKey = null;
      agentId = null;
      mentionRecents = [];
      emojiRecents = [];
      publish({ status: "idle", entries: [], prReferences: [] });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scopeGeneration += 1;
      requestGeneration += 1;
      controller?.abort();
      unsubscribeTransport?.dispose();
      controller = null;
      listeners.clear();
    },
  };
}
