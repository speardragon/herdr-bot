import type { AgentDesktopBridge, SidebarSection } from "../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 5684300-5689000
// pKe/OHn/LHn/jHn: account-scoped sidebar.last-sections durable fallback,
// host-box hydration, retries, optimistic ordering, stale generation fencing,
// write failure recovery, reset, and disposal.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 5729700-5732200
// coordinator account restore calls sidebarSections.restore, then loadFromBox;
// reconnect and host-settings events reload the coordinator-owned snapshot.

export const SIDEBAR_SECTIONS_SLICE = {
  slice: "sidebar.last-sections",
  schemaVersion: 1,
  scope: "host-durable",
  accountSensitive: true
} as const;

export const SIDEBAR_SECTIONS_WRITE_FAILURE = {
  code: "client/sidebar-sections-write-failed",
  boundary: "client",
  retry: null
} as const;

export const SIDEBAR_SYNTHETIC_SECTION_ID = "__agents__";

export type SidebarSectionMovePosition = "before" | "after";

export interface SidebarSectionActionState {
  readonly isSynthetic: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly moveUpTargetId: string | null;
  readonly moveDownTargetId: string | null;
}

export interface SidebarSectionDeleteConfirmation {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: "Delete";
  readonly cancelLabel: "Cancel";
  readonly destructive: true;
}

export interface SidebarSectionCommands {
  rename(sectionId: string, name: string): void;
  remove(sectionId: string): void;
  create(agentIds: readonly string[]): string | null;
  assignAgents(agentIds: readonly string[], sectionId: string): void;
  move(sectionId: string, targetId: string, position: SidebarSectionMovePosition): void;
}

export interface SidebarSectionsHostSettingsEvent {
  readonly fields: readonly string[];
}

export interface SidebarSectionsStateStore {
  get(): readonly SidebarSection[] | null;
  getWriteFailure(): typeof SIDEBAR_SECTIONS_WRITE_FAILURE | null;
  subscribe(listener: () => void): () => void;
  restore(accountSlot: string | null): Promise<void>;
  loadFromBridge(): Promise<void>;
  setSections(sections: readonly SidebarSection[]): void;
  readonly commands: SidebarSectionCommands;
  reset(): void;
  dispose(): void;
}

export function sidebarSectionActionState(sections: readonly Pick<SidebarSection, "id">[], sectionId: string): SidebarSectionActionState {
  const index = sections.findIndex((section) => section.id === sectionId);
  const isSynthetic = sectionId === SIDEBAR_SYNTHETIC_SECTION_ID;
  // Keep the shipped findLastIndex(section => !section.isSynthetic) behavior
  // while remaining source-compatible with the renderer shard's ES2022 lib.
  let lastEditableIndex = -1;
  for (let cursor = sections.length - 1; cursor >= 0; cursor -= 1) {
    if (sections[cursor]?.id !== SIDEBAR_SYNTHETIC_SECTION_ID) {
      lastEditableIndex = cursor;
      break;
    }
  }
  const canMoveUp = !isSynthetic && index > 0;
  const canMoveDown = !isSynthetic && index >= 0 && index < lastEditableIndex;
  return {
    isSynthetic,
    canMoveUp,
    canMoveDown,
    moveUpTargetId: canMoveUp ? sections[index - 1]?.id ?? null : null,
    moveDownTargetId: canMoveDown ? sections[index + 1]?.id ?? null : null
  };
}

export function renameSidebarSection(sections: readonly SidebarSection[], sectionId: string, name: string): SidebarSection[] {
  if (sectionId === SIDEBAR_SYNTHETIC_SECTION_ID) return [...sections];
  return sections.map((section) => section.id === sectionId ? { ...section, name } : { ...section, agentIds: [...section.agentIds] });
}

export function removeSidebarSection(sections: readonly SidebarSection[], sectionId: string): SidebarSection[] {
  if (sectionId === SIDEBAR_SYNTHETIC_SECTION_ID) return sections.map((section) => ({ ...section, agentIds: [...section.agentIds] }));
  return sections.filter((section) => section.id !== sectionId).map((section) => ({ ...section, agentIds: [...section.agentIds] }));
}

export function moveSidebarSection(sections: readonly SidebarSection[], sectionId: string, targetId: string, position: SidebarSectionMovePosition): SidebarSection[] {
  if (sectionId === SIDEBAR_SYNTHETIC_SECTION_ID || targetId === SIDEBAR_SYNTHETIC_SECTION_ID || sectionId === targetId) return sections.map((section) => ({ ...section, agentIds: [...section.agentIds] }));
  const section = sections.find((candidate) => candidate.id === sectionId);
  if (section == null || !sections.some((candidate) => candidate.id === targetId)) return sections.map((candidate) => ({ ...candidate, agentIds: [...candidate.agentIds] }));
  const remaining = sections.filter((candidate) => candidate.id !== sectionId);
  const targetIndex = remaining.findIndex((candidate) => candidate.id === targetId);
  const insertAt = targetIndex + (position === "before" ? 0 : 1);
  return [...remaining.slice(0, insertAt), { ...section, agentIds: [...section.agentIds] }, ...remaining.slice(insertAt)];
}

// jHn.assignAgents: exact bulk membership projection. The synthetic section is
// the unassigned bucket, so assigning there removes the IDs from editable
// sections without adding a durable membership record.
export function assignSidebarAgents(sections: readonly SidebarSection[], agentIds: readonly string[], sectionId: string): SidebarSection[] {
  const moved = new Set(agentIds);
  const unassigned = sections.map((section) => ({
    ...section,
    agentIds: section.agentIds.filter((agentId) => !moved.has(agentId))
  }));
  if (sectionId === SIDEBAR_SYNTHETIC_SECTION_ID) return unassigned;
  return unassigned.map((section) => section.id === sectionId
    ? { ...section, agentIds: [...section.agentIds, ...moved] }
    : section);
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2783470-2783850
// A3n: exact section-delete title, description, labels, and destructive confirmation model.
export function sidebarSectionDeleteConfirmation(name: string): SidebarSectionDeleteConfirmation {
  return {
    title: `Delete “${name}”`,
    description: ["Its agents move to ", "Unassigned", ". No agents are deleted."].join(""),
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    destructive: true
  };
}

type SidebarSectionsBridge = Pick<AgentDesktopBridge, "getSidebarSections" | "setSidebarSections" | "clientPersistence">;

interface SidebarSectionsStateOptions {
  readonly bridge: SidebarSectionsBridge;
  readonly subscribeHostSettings: (listener: (event: SidebarSectionsHostSettingsEvent) => void) => () => void;
  readonly wait?: (delayMs: number) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSidebarSection(value: unknown): value is SidebarSection {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !Array.isArray(value.agentIds)) return false;
  return value.agentIds.every((agentId) => typeof agentId === "string")
    && (value.isCollapsed === undefined || typeof value.isCollapsed === "boolean");
}

function normalizeSidebarSections(sections: readonly unknown[]): SidebarSection[] {
  const seenSectionIds = new Set<string>();
  const claimedAgentIds = new Set<string>();
  const normalized: SidebarSection[] = [];
  for (const candidate of sections) {
    if (!isSidebarSection(candidate)) continue;
    const id = candidate.id.trim();
    if (id.length === 0 || seenSectionIds.has(id)) continue;
    seenSectionIds.add(id);
    if (id === "__agents__") continue;
    const agentIds: string[] = [];
    for (const agentId of candidate.agentIds) {
      if (agentId.length === 0 || claimedAgentIds.has(agentId)) continue;
      claimedAgentIds.add(agentId);
      agentIds.push(agentId);
    }
    normalized.push({ id, name: candidate.name, agentIds, isCollapsed: false });
  }
  if (normalized.length === 0) return [];
  normalized.push({ id: "__agents__", name: "Unassigned", agentIds: [], isCollapsed: false });
  return normalized;
}

function copySections(sections: readonly SidebarSection[] | null): SidebarSection[] | null {
  return sections?.map((section) => ({ ...section, agentIds: [...section.agentIds] })) ?? null;
}

function accountKey(accountSlot: string): string {
  if (accountSlot.length === 0) throw new Error("accountSlot must not be empty");
  return `sand.client.slice.account.${encodeURIComponent(accountSlot).replaceAll(".", "%2E")}.${SIDEBAR_SECTIONS_SLICE.slice}`;
}

function parseDurable(value: string | null): SidebarSection[] | null {
  if (value == null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.schemaVersion !== SIDEBAR_SECTIONS_SLICE.schemaVersion || !isRecord(parsed.value) || !Array.isArray(parsed.value.sections)) return null;
    return normalizeSidebarSections(parsed.value.sections);
  } catch {
    return null;
  }
}

function serializeDurable(sections: readonly SidebarSection[]): string {
  return JSON.stringify({ schemaVersion: SIDEBAR_SECTIONS_SLICE.schemaVersion, value: { sections } });
}

function isCurrentHostSettingsEvent(event: SidebarSectionsHostSettingsEvent): boolean {
  return event.fields.includes("sidebarSections");
}

async function defaultWait(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

async function runWithRetry<T>(operation: () => Promise<T>, wait: (delayMs: number) => Promise<void>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(Math.min(400 * 2 ** attempt, 2_000));
    }
  }
  throw lastError;
}

export function createSidebarSectionsStateStore(options: SidebarSectionsStateOptions): SidebarSectionsStateStore {
  let accountSlot: string | null = null;
  let generation = 0;
  let disposed = false;
  let answer: SidebarSection[] | null | undefined;
  let snapshot: SidebarSection[] | null = null;
  let writeFailure: typeof SIDEBAR_SECTIONS_WRITE_FAILURE | null = null;
  let intent: SidebarSection[] | null = null;
  let durableJson: string | null = null;
  let operations = Promise.resolve();
  let idSeed = 0;
  const listeners = new Set<() => void>();
  const wait = options.wait ?? defaultWait;

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const isCurrent = (expectedGeneration: number): boolean => !disposed && generation === expectedGeneration;
  const persist = (sections: readonly SidebarSection[] | null): void => {
    if (accountSlot == null) return;
    const expectedGeneration = generation;
    const isLive = (): boolean => isCurrent(expectedGeneration);
    if (sections == null) {
      if (durableJson == null) return;
      const slot = accountSlot;
      durableJson = null;
      operations = operations.then(() => isLive() && accountSlot === slot ? options.bridge.clientPersistence.remove(accountKey(slot)) : undefined).catch(() => {});
      return;
    }
    const slot = accountSlot;
    const serialized = serializeDurable(sections);
    if (serialized === durableJson) return;
    durableJson = serialized;
    operations = operations.then(() => isLive() && accountSlot === slot ? options.bridge.clientPersistence.write(accountKey(slot), serialized) : undefined).catch(() => {});
  };
  const apply = (sections: SidebarSection[] | null): void => {
    answer = copySections(sections);
    snapshot = copySections(sections);
    persist(snapshot);
    notify();
  };
  const enqueue = (operation: (isLive: () => boolean) => Promise<void>): Promise<void> => {
    const expectedGeneration = generation;
    const isLive = (): boolean => isCurrent(expectedGeneration);
    operations = operations.then(() => isLive() ? operation(isLive).catch(() => {}) : undefined);
    return operations;
  };
  const loadFromBridge = (): Promise<void> => {
    if (disposed || accountSlot == null) return Promise.resolve();
    return enqueue(async (isLive) => {
      const sections = await runWithRetry(() => options.bridge.getSidebarSections(), wait);
      if (!isLive()) return;
      apply(sections == null ? null : normalizeSidebarSections(sections));
    });
  };
  const stopHostSettings = options.subscribeHostSettings((event) => {
    if (isCurrentHostSettingsEvent(event)) void loadFromBridge();
  });
  const setSections = (sections: readonly SidebarSection[]): void => {
    if (disposed || answer == null) return;
    const next = normalizeSidebarSections(sections);
    intent = next;
    snapshot = copySections(next);
    notify();
    void enqueue(async (isLive) => {
      try {
        const applied = await runWithRetry(() => options.bridge.setSidebarSections(next), wait);
        if (!isLive() || intent !== next) return;
        writeFailure = null;
        apply(applied == null ? null : normalizeSidebarSections(applied));
      } catch (error) {
        if (!isLive() || intent !== next) return;
        writeFailure = SIDEBAR_SECTIONS_WRITE_FAILURE;
        notify();
        apply(answer ?? null);
        void loadFromBridge();
        void error;
      }
    });
  };
  const commands: SidebarSectionCommands = {
    create(agentIds) {
      const current = snapshot;
      if (disposed || answer == null || current == null) return null;
      idSeed += 1;
      const sectionId = `section-${Date.now().toString(36)}-${idSeed.toString(36)}`;
      setSections([{ id: sectionId, name: "New section", agentIds: [...agentIds], isCollapsed: false }, ...current]);
      return sectionId;
    },
    assignAgents(agentIds, sectionId) {
      if (snapshot != null) setSections(assignSidebarAgents(snapshot, agentIds, sectionId));
    },
    rename(sectionId, name) {
      if (snapshot != null) setSections(renameSidebarSection(snapshot, sectionId, name));
    },
    remove(sectionId) {
      if (snapshot != null) setSections(removeSidebarSection(snapshot, sectionId));
    },
    move(sectionId, targetId, position) {
      if (snapshot != null) setSections(moveSidebarSection(snapshot, sectionId, targetId, position));
    }
  };

  return {
    get: () => snapshot,
    getWriteFailure: () => writeFailure,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore(nextAccountSlot) {
      accountSlot = nextAccountSlot;
      if (disposed || nextAccountSlot == null) return;
      const expectedGeneration = generation;
      await operations;
      if (!isCurrent(expectedGeneration) || accountSlot !== nextAccountSlot) return;
      const stored = parseDurable(await options.bridge.clientPersistence.read(accountKey(nextAccountSlot)));
      if (!isCurrent(expectedGeneration) || accountSlot !== nextAccountSlot) return;
      if (stored == null) {
        durableJson = null;
        return;
      }
      durableJson = serializeDurable(stored);
      if (answer === undefined) {
        snapshot = copySections(stored);
        notify();
      }
    },
    loadFromBridge,
    setSections,
    commands,
    reset() {
      generation += 1;
      accountSlot = null;
      answer = undefined;
      snapshot = null;
      intent = null;
      durableJson = null;
      writeFailure = null;
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      stopHostSettings();
      listeners.clear();
    }
  };
}
