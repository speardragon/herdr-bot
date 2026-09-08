import type { AgentDesktopBridge } from "../../../contracts/desktop-bridge";
import { createSnapshotStore } from "../../../runtime/snapshot-store";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2219400-2221900
// Iie/jFe/registry.register: account-sensitive client-slice keying and envelopes.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2223460-2230360
// RFe/ran/lan: ui-agent-refs schema, restore, write queue, and collapsedSectionIds reducer.

export const UI_AGENT_REFS_SLICE = {
  slice: "ui-agent-refs",
  schemaVersion: 1,
  scope: "client-persisted",
  accountSensitive: true
} as const;

export const LEGACY_SIDEBAR_KEYS = {
  pinnedAgents: "sand.pinnedAgentIds",
  reactionPins: "sand.reactions.pinned",
  mentionRecents: "sand.mention.recents"
} as const;

const MAX_MENTION_RECENTS = 20;
const MAX_EMOJI_RECENTS = 50;

export type UiAgentReferenceCategory = "assistants" | "automations" | "tools";

export interface UiAgentMentionRecent {
  category: UiAgentReferenceCategory;
  id: string;
}

export interface UiAgentRefsState {
  pinnedAgentIds: string[];
  collapsedSectionIds: string[];
  mentionRecents: UiAgentMentionRecent[];
  emojiRecents: string[];
}

export interface EmojiRecentsStore {
  get(): readonly string[];
}

export type ClientSliceRead =
  | { kind: "absent" }
  | { kind: "corrupt" }
  | { kind: "envelope"; envelope: { schemaVersion: number; value: unknown } };

export interface UiAgentRefsSliceStore {
  read(accountSlot: string): Promise<ClientSliceRead>;
  write(request: { accountSlot: string; value: UiAgentRefsState }): Promise<void>;
  clear(accountSlot: string): Promise<void>;
}

export interface LegacyUiAgentRefsPersistence {
  read(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
}

export interface SidebarCollapsePersistence {
  readonly slice: UiAgentRefsSliceStore;
  readonly legacy: LegacyUiAgentRefsPersistence;
}

export const EMPTY_UI_AGENT_REFS_STATE: UiAgentRefsState = {
  pinnedAgentIds: [],
  collapsedSectionIds: [],
  mentionRecents: [],
  emojiRecents: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : fallback;
}

function mentionRecents(value: unknown): UiAgentMentionRecent[] {
  if (!Array.isArray(value)) return [];
  const result: UiAgentMentionRecent[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const category = entry.category;
    const id = entry.id;
    if ((category !== "assistants" && category !== "automations" && category !== "tools") || typeof id !== "string" || id.length === 0) continue;
    result.push({ category, id });
    if (result.length >= MAX_MENTION_RECENTS) break;
  }
  return result;
}

function parseLegacyStringArray(value: string | null): string[] {
  if (value == null) return [];
  try {
    return stringArray(JSON.parse(value));
  } catch {
    return [];
  }
}

function parseLegacyMentionRecents(value: string | null): UiAgentMentionRecent[] {
  if (value == null) return [];
  try {
    return mentionRecents(JSON.parse(value));
  } catch {
    return [];
  }
}

function projectUiAgentRefs(value: unknown): UiAgentRefsState | null {
  if (!isRecord(value)) return null;
  return {
    pinnedAgentIds: stringArray(value.pinnedAgentIds),
    collapsedSectionIds: stringArray(value.collapsedSectionIds),
    mentionRecents: mentionRecents(value.mentionRecents),
    emojiRecents: stringArray(value.emojiRecents).slice(0, MAX_EMOJI_RECENTS)
  };
}

function parseEnvelope(value: string | null): ClientSliceRead {
  if (value == null) return { kind: "absent" };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || typeof parsed.schemaVersion !== "number" || !("value" in parsed)) return { kind: "corrupt" };
    return { kind: "envelope", envelope: { schemaVersion: parsed.schemaVersion, value: parsed.value } };
  } catch {
    return { kind: "corrupt" };
  }
}

function encodeAccountSlot(accountSlot: string): string {
  return encodeURIComponent(accountSlot).replaceAll(".", "%2E");
}

export function uiAgentRefsPersistenceKey(accountSlot: string): string {
  if (accountSlot.length === 0) throw new Error("accountSlot must not be empty");
  return `sand.client.slice.account.${encodeAccountSlot(accountSlot)}.${UI_AGENT_REFS_SLICE.slice}`;
}

export function createSidebarCollapsePersistence(clientPersistence: AgentDesktopBridge["clientPersistence"]): SidebarCollapsePersistence {
  return {
    slice: {
      async read(accountSlot) {
        return parseEnvelope(await clientPersistence.read(uiAgentRefsPersistenceKey(accountSlot)));
      },
      async write({ accountSlot, value }) {
        await clientPersistence.write(uiAgentRefsPersistenceKey(accountSlot), JSON.stringify({ schemaVersion: UI_AGENT_REFS_SLICE.schemaVersion, value }));
      },
      async clear(accountSlot) {
        await clientPersistence.remove(uiAgentRefsPersistenceKey(accountSlot));
      }
    },
    legacy: {
      read: (key) => clientPersistence.read(key),
      remove: (key) => clientPersistence.remove(key)
    }
  };
}

async function readLegacyUiAgentRefs(persistence: LegacyUiAgentRefsPersistence): Promise<{ value: UiAgentRefsState; keys: string[] }> {
  const entries = await Promise.all([
    persistence.read(LEGACY_SIDEBAR_KEYS.pinnedAgents),
    persistence.read(LEGACY_SIDEBAR_KEYS.reactionPins),
    persistence.read(LEGACY_SIDEBAR_KEYS.mentionRecents)
  ]);
  return {
    value: {
      pinnedAgentIds: parseLegacyStringArray(entries[0]),
      collapsedSectionIds: [],
      mentionRecents: parseLegacyMentionRecents(entries[2]),
      emojiRecents: []
    },
    keys: [LEGACY_SIDEBAR_KEYS.pinnedAgents, LEGACY_SIDEBAR_KEYS.reactionPins, LEGACY_SIDEBAR_KEYS.mentionRecents].filter((_, index) => entries[index] != null)
  };
}

function statesEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function setCollapsedSectionIds(current: readonly string[], sectionId: string, collapsed: boolean): string[] {
  if (sectionId.length === 0) return [...current];
  if (current.includes(sectionId) === collapsed) return [...current];
  return collapsed ? [...current, sectionId] : current.filter((entry) => entry !== sectionId);
}

export interface SidebarCollapseStateStore {
  get(): UiAgentRefsState;
  getCollapsedSectionIds(): readonly string[];
  emojiRecents: EmojiRecentsStore;
  subscribe(listener: () => void): () => void;
  setSectionCollapsed(sectionId: string, collapsed: boolean): void;
  toggleSectionCollapsed(sectionId: string): void;
  recordEmojiRecent(emoji: string): void;
  restore(accountSlot: string | null): Promise<void>;
  reset(): void;
  dispose(): void;
}

export function createSidebarCollapseStateStore(persistence: SidebarCollapsePersistence): SidebarCollapseStateStore {
  const stateStore = createSnapshotStore<UiAgentRefsState>({
    pinnedAgentIds: [],
    collapsedSectionIds: [],
    mentionRecents: [],
    emojiRecents: []
  });
  let accountSlot: string | null = null;
  let generation = 0;
  let disposed = false;
  let writes = Promise.resolve();

  const isCurrent = (expectedGeneration: number): boolean => !disposed && generation === expectedGeneration;
  const enqueueWrite = (value: UiAgentRefsState): void => {
    if (accountSlot == null) return;
    const slot = accountSlot;
    writes = writes.then(() => persistence.slice.write({ accountSlot: slot, value })).catch(() => {});
  };
  const replaceState = (next: UiAgentRefsState): void => {
    stateStore.set({
      pinnedAgentIds: [...next.pinnedAgentIds],
      collapsedSectionIds: [...next.collapsedSectionIds],
      mentionRecents: next.mentionRecents.map((entry) => ({ ...entry })),
      emojiRecents: [...next.emojiRecents]
    });
  };

  return {
    get: () => stateStore.get(),
    getCollapsedSectionIds: () => stateStore.get().collapsedSectionIds,
    emojiRecents: { get: () => stateStore.get().emojiRecents },
    subscribe: stateStore.subscribe,
    setSectionCollapsed(sectionId, collapsed) {
      if (disposed || sectionId.length === 0) return;
      const state = stateStore.get();
      const nextCollapsedSectionIds = setCollapsedSectionIds(state.collapsedSectionIds, sectionId, collapsed);
      if (statesEqual(state.collapsedSectionIds, nextCollapsedSectionIds)) return;
      const next = { ...state, collapsedSectionIds: nextCollapsedSectionIds };
      stateStore.set(next);
      enqueueWrite(next);
    },
    toggleSectionCollapsed(sectionId) {
      if (disposed || sectionId.length === 0) return;
      this.setSectionCollapsed(sectionId, !stateStore.get().collapsedSectionIds.includes(sectionId));
    },
    recordEmojiRecent(emoji) {
      if (disposed || emoji.length === 0) return;
      const state = stateStore.get();
      const next = { ...state, emojiRecents: [emoji, ...state.emojiRecents.filter((entry) => entry !== emoji)].slice(0, MAX_EMOJI_RECENTS) };
      stateStore.set(next);
      enqueueWrite(next);
    },
    async restore(nextAccountSlot) {
      accountSlot = nextAccountSlot;
      if (disposed || nextAccountSlot == null) return;
      const expectedGeneration = generation;
      await writes;
      if (!isCurrent(expectedGeneration) || accountSlot !== nextAccountSlot) return;
      const stored = await persistence.slice.read(nextAccountSlot);
      if (!isCurrent(expectedGeneration) || accountSlot !== nextAccountSlot) return;
      if (stored.kind === "corrupt") {
        await persistence.slice.clear(nextAccountSlot);
        if (isCurrent(expectedGeneration) && accountSlot === nextAccountSlot) replaceState(EMPTY_UI_AGENT_REFS_STATE);
        return;
      }
      if (stored.kind === "absent") {
        const legacy = await readLegacyUiAgentRefs(persistence.legacy);
        if (!isCurrent(expectedGeneration) || accountSlot !== nextAccountSlot) return;
        replaceState(legacy.value);
        if (legacy.keys.length === 0) return;
        await persistence.slice.write({ accountSlot: nextAccountSlot, value: legacy.value });
        if (!isCurrent(expectedGeneration) || accountSlot !== nextAccountSlot) return;
        for (const key of new Set(legacy.keys)) await persistence.legacy.remove(key);
        return;
      }
      if (stored.envelope.schemaVersion !== UI_AGENT_REFS_SLICE.schemaVersion) return;
      const projected = projectUiAgentRefs(stored.envelope.value);
      if (projected == null) {
        await persistence.slice.clear(nextAccountSlot);
        if (isCurrent(expectedGeneration) && accountSlot === nextAccountSlot) replaceState(EMPTY_UI_AGENT_REFS_STATE);
        return;
      }
      replaceState(projected);
      const legacy = await readLegacyUiAgentRefs(persistence.legacy);
      if (!isCurrent(expectedGeneration) || accountSlot !== nextAccountSlot) return;
      for (const key of new Set(legacy.keys)) await persistence.legacy.remove(key);
    },
    reset() {
      generation += 1;
      accountSlot = null;
      replaceState(EMPTY_UI_AGENT_REFS_STATE);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
    }
  };
}
