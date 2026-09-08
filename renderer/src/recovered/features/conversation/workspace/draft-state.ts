import type { AgentDesktopBridge } from "../../../contracts/desktop-bridge";
import { areComposerDraftsEqual, parseComposerDraft, type ComposerDraft } from "./model";

// Immutable root: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4769359 (composer-drafts slice metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4771060 (per-agent draft/recovery store)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4773604 (mounted draft lifecycle)

export const COMPOSER_DRAFT_SLICE = {
  slice: "composer-drafts",
  schemaVersion: 1,
  scope: "client-persisted",
  accountSensitive: true
} as const;

export interface ComposerDraftSnapshot {
  readonly draft: ComposerDraft | null;
  readonly recovery: ComposerDraft | null;
}

export interface ComposerDraftSnapshotStore {
  get(): ComposerDraftSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface ComposerDraftPersistence {
  read(accountSlot: string): Promise<string | null>;
  write(accountSlot: string, value: ComposerDraftEnvelope): Promise<void>;
  clear(accountSlot: string): Promise<void>;
}

export interface ComposerDraftEnvelope {
  agents: Record<string, ComposerDraftSnapshot & { readonly draftId: string | null }>;
}

export interface ComposerDraftStateStore {
  snapshotsFor(agentKey: string): ComposerDraftSnapshotStore;
  setDraft(agentKey: string, draft: ComposerDraft): void;
  identifyDraft(input: { agentId: string; draft: ComposerDraft }): { agentId: string; draftId: string } | null;
  clearDraftIfCurrent(input: { agentId: string; draftId: string }): boolean;
  clearDraftIfMatches(input: { agentId: string; draft: ComposerDraft }): boolean;
  clearDraft(agentKey: string): void;
  recoverDraft(agentKey: string, draft: ComposerDraft): void;
  clearRecovery(agentKey: string): void;
  restore(accountSlot: string | null): Promise<void>;
  reset(): void;
  dispose(): void;
}

const EMPTY_SNAPSHOT: ComposerDraftSnapshot = { draft: null, recovery: null };
const EMPTY_RECORD = { draft: null, draftId: null, recovery: null } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeAccountSlot(accountSlot: string): string {
  return encodeURIComponent(accountSlot).replaceAll(".", "%2E");
}

export function composerDraftPersistenceKey(accountSlot: string): string {
  if (accountSlot.length === 0) throw new Error("accountSlot must not be empty");
  return `sand.client.slice.account.${encodeAccountSlot(accountSlot)}.${COMPOSER_DRAFT_SLICE.slice}`;
}

function cloneDraft(draft: ComposerDraft | null): ComposerDraft | null {
  if (draft == null) return null;
  return {
    prompt: draft.prompt,
    attachments: draft.attachments.map(({ path, name, size }) => ({ path, name, ...(size === undefined ? {} : { size }) })),
    ...(draft.richText === undefined ? {} : { richText: draft.richText }),
    ...(draft.replyToId === undefined ? {} : { replyToId: draft.replyToId }),
    ...(draft.isFork === undefined ? {} : { isFork: draft.isFork })
  };
}

function cloneSnapshot(snapshot: ComposerDraftSnapshot): ComposerDraftSnapshot {
  return { draft: cloneDraft(snapshot.draft), recovery: cloneDraft(snapshot.recovery) };
}

function parseEnvelope(value: string | null):
  | { kind: "absent" }
  | { kind: "corrupt" }
  | { kind: "envelope"; schemaVersion: number; value: unknown } {
  if (value == null) return { kind: "absent" };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || typeof parsed.schemaVersion !== "number" || !("value" in parsed)) return { kind: "corrupt" };
    return { kind: "envelope", schemaVersion: parsed.schemaVersion, value: parsed.value };
  } catch {
    return { kind: "corrupt" };
  }
}

function parsePersistedValue(value: unknown): Map<string, { draft: ComposerDraft | null; draftId: string | null; recovery: ComposerDraft | null }> | null {
  if (!isRecord(value) || !isRecord(value.agents)) return null;
  const result = new Map<string, { draft: ComposerDraft | null; draftId: string | null; recovery: ComposerDraft | null }>();
  for (const [agentKey, raw] of Object.entries(value.agents)) {
    if (agentKey.length === 0 || !isRecord(raw)) return null;
    const draft = raw.draft == null ? null : parseComposerDraft(raw.draft);
    const recovery = raw.recovery == null ? null : parseComposerDraft(raw.recovery);
    if ((raw.draft != null && draft == null) || (raw.recovery != null && recovery == null)) return null;
    const draftId = raw.draftId == null ? null : typeof raw.draftId === "string" && raw.draftId.length > 0 ? raw.draftId : null;
    if (raw.draftId != null && draftId == null || draft == null && draftId != null) return null;
    if (draft == null && recovery == null) continue;
    result.set(agentKey, { draft, draftId, recovery });
  }
  return result;
}

function draftId(): string {
  const crypto = globalThis.crypto;
  return crypto?.randomUUID != null
    ? crypto.randomUUID()
    : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createComposerDraftPersistence(clientPersistence: AgentDesktopBridge["clientPersistence"]): ComposerDraftPersistence {
  return {
    async read(accountSlot) {
      return clientPersistence.read(composerDraftPersistenceKey(accountSlot));
    },
    async write(accountSlot, value) {
      await clientPersistence.write(
        composerDraftPersistenceKey(accountSlot),
        JSON.stringify({ schemaVersion: COMPOSER_DRAFT_SLICE.schemaVersion, value })
      );
    },
    clear: (accountSlot) => clientPersistence.remove(composerDraftPersistenceKey(accountSlot))
  };
}

export function createComposerDraftStateStore(persistence: ComposerDraftPersistence): ComposerDraftStateStore {
  const records = new Map<string, { draft: ComposerDraft | null; draftId: string | null; recovery: ComposerDraft | null }>();
  const snapshots = new Map<string, { snapshot: ComposerDraftSnapshot; listeners: Set<() => void> }>();
  let accountSlot: string | null = null;
  let generation = 0;
  let disposed = false;
  let writes = Promise.resolve();

  const snapshotFor = (agentKey: string) => {
    const existing = snapshots.get(agentKey);
    if (existing != null) return existing;
    const created = { snapshot: EMPTY_SNAPSHOT, listeners: new Set<() => void>() };
    snapshots.set(agentKey, created);
    return created;
  };
  const notify = (agentKey: string, next: ComposerDraftSnapshot) => {
    const state = snapshotFor(agentKey);
    state.snapshot = cloneSnapshot(next);
    for (const listener of [...state.listeners]) listener();
  };
  const currentRecord = (agentKey: string) => records.get(agentKey) ?? EMPTY_RECORD;
  const serialize = (): ComposerDraftEnvelope => {
    const agents: ComposerDraftEnvelope["agents"] = {};
    for (const [agentKey, record] of records) {
      if (record.draft == null && record.recovery == null) continue;
      agents[agentKey] = { draft: cloneDraft(record.draft), draftId: record.draftId, recovery: cloneDraft(record.recovery) };
    }
    return { agents };
  };
  const enqueueWrite = () => {
    if (accountSlot == null || disposed) return;
    const slot = accountSlot;
    const value = serialize();
    writes = writes.then(() => persistence.write(slot, value)).catch(() => {});
  };
  const replace = (agentKey: string, next: { draft: ComposerDraft | null; draftId: string | null; recovery: ComposerDraft | null }) => {
    if (next.draft == null && next.recovery == null) records.delete(agentKey);
    else records.set(agentKey, { draft: cloneDraft(next.draft), draftId: next.draftId, recovery: cloneDraft(next.recovery) });
    notify(agentKey, { draft: next.draft, recovery: next.recovery });
    enqueueWrite();
  };
  const isCurrent = (expectedGeneration: number, expectedAccount: string): boolean =>
    !disposed && generation === expectedGeneration && accountSlot === expectedAccount;

  return {
    snapshotsFor(agentKey) {
      const state = snapshotFor(agentKey);
      return {
        get: () => state.snapshot,
        subscribe(listener) {
          state.listeners.add(listener);
          return () => state.listeners.delete(listener);
        }
      };
    },
    setDraft(agentKey, draft) {
      if (disposed || agentKey.length === 0) return;
      const current = currentRecord(agentKey);
      if (draft.prompt.trim().length === 0 && draft.attachments.length === 0) {
        if (current.draft == null) return;
        replace(agentKey, { draft: null, draftId: null, recovery: current.recovery });
        return;
      }
      if (current.draft != null && areComposerDraftsEqual(current.draft, draft)) return;
      replace(agentKey, { draft, draftId: draftId(), recovery: current.recovery });
    },
    identifyDraft({ agentId, draft }) {
      if (disposed || agentId.length === 0) return null;
      const current = currentRecord(agentId);
      return current.draft != null && current.draftId != null && areComposerDraftsEqual(current.draft, draft)
        ? { agentId, draftId: current.draftId }
        : null;
    },
    clearDraftIfCurrent({ agentId, draftId: currentDraftId }) {
      if (disposed || agentId.length === 0) return false;
      const current = currentRecord(agentId);
      if (current.draft == null || current.draftId !== currentDraftId) return false;
      replace(agentId, { draft: null, draftId: null, recovery: current.recovery });
      return true;
    },
    clearDraftIfMatches({ agentId, draft }) {
      if (disposed || agentId.length === 0) return false;
      const current = currentRecord(agentId);
      if (current.draft == null || !areComposerDraftsEqual(current.draft, draft)) return false;
      replace(agentId, { draft: null, draftId: null, recovery: current.recovery });
      return true;
    },
    clearDraft(agentKey) {
      if (disposed || agentKey.length === 0) return;
      const current = currentRecord(agentKey);
      if (current.draft != null) replace(agentKey, { draft: null, draftId: null, recovery: current.recovery });
    },
    recoverDraft(agentKey, recovery) {
      if (disposed || agentKey.length === 0 || recovery.prompt.trim().length === 0 && recovery.attachments.length === 0) return;
      const current = currentRecord(agentKey);
      replace(agentKey, current.draft == null
        ? { draft: recovery, draftId: draftId(), recovery: current.recovery }
        : { draft: current.draft, draftId: current.draftId, recovery });
    },
    clearRecovery(agentKey) {
      if (disposed || agentKey.length === 0) return;
      const current = currentRecord(agentKey);
      if (current.recovery != null) replace(agentKey, { draft: current.draft, draftId: current.draftId, recovery: null });
    },
    async restore(nextAccountSlot) {
      generation += 1;
      const expectedGeneration = generation;
      accountSlot = nextAccountSlot;
      records.clear();
      for (const agentKey of snapshots.keys()) notify(agentKey, EMPTY_SNAPSHOT);
      if (disposed || nextAccountSlot == null) return;
      await writes;
      if (!isCurrent(expectedGeneration, nextAccountSlot)) return;
      const stored = parseEnvelope(await persistence.read(nextAccountSlot));
      if (!isCurrent(expectedGeneration, nextAccountSlot)) return;
      if (stored.kind === "absent") return;
      if (stored.kind === "corrupt" || stored.schemaVersion !== COMPOSER_DRAFT_SLICE.schemaVersion) {
        writes = writes.then(() => persistence.clear(nextAccountSlot)).catch(() => {});
        return;
      }
      const restored = parsePersistedValue(stored.value);
      if (restored == null) {
        writes = writes.then(() => persistence.clear(nextAccountSlot)).catch(() => {});
        return;
      }
      for (const [agentKey, record] of restored) {
        records.set(agentKey, record);
        notify(agentKey, { draft: record.draft, recovery: record.recovery });
      }
    },
    reset() {
      generation += 1;
      accountSlot = null;
      records.clear();
      for (const agentKey of snapshots.keys()) notify(agentKey, EMPTY_SNAPSHOT);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      accountSlot = null;
      records.clear();
      for (const state of snapshots.values()) state.listeners.clear();
      snapshots.clear();
    }
  };
}
