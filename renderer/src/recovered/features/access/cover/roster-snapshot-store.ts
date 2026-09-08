import type { ProductionCoordinatorClient } from "../../../../production/coordinator-client";
import type { AgentDesktopBridge } from "../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5648809
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5642220
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5639943
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export const ROSTER_SNAPSHOT_SLICE = {
  slice: "roster.last-roster",
  schemaVersion: 2
} as const;

export type RosterSnapshotLoadState = "loading" | "ready" | "error";
export type RosterSnapshotTransportState = "connecting" | "connected" | "down";

export interface RosterSnapshotAgent extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
}

export interface RosterSnapshotFailure {
  readonly code: string;
  readonly message: string | null;
  readonly transportKind: string | null;
}

export interface RosterSnapshot {
  readonly agents: readonly RosterSnapshotAgent[];
  readonly hasCompleteRoster: boolean;
  readonly isShowingRestoredRoster: boolean;
  readonly loadState: RosterSnapshotLoadState;
  readonly failure: RosterSnapshotFailure | null;
  readonly isFetching: boolean;
  readonly confirmedFetches: number;
  readonly transport: RosterSnapshotTransportState;
}

export interface RosterSnapshotSource {
  listAgents(): Promise<unknown>;
  readPersisted(accountSlot: string): Promise<string | null>;
  subscribeAgents(listener: (value: unknown) => void): () => void;
  subscribeAgentUpserted(listener: (value: unknown) => void): () => void;
  subscribeTransport(listener: (value: unknown) => void): () => void;
}

export interface RosterSnapshotStore {
  get(): RosterSnapshot;
  subscribe(listener: () => void): () => void;
  connect(accountSlot: string | null): Promise<void>;
  noteReconnect(): Promise<void>;
  reset(): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function strictPersistedAgent(value: unknown): RosterSnapshotAgent | null {
  if (!isRecord(value)
    || !nonEmptyString(value.id)
    || typeof value.name !== "string"
    || typeof value.description !== "string"
    || typeof value.path !== "string"
    || typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)
    || typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt)
    || typeof value.hasUnread !== "boolean"
    || typeof value.notificationsEnabled !== "boolean"
    || typeof value.notifyOnUpdatesEnabled !== "boolean"
    || typeof value.isGroup !== "boolean"
    || typeof value.origin !== "string"
    || value.lastMessageId !== null && typeof value.lastMessageId !== "string"
    || value.lastEntry !== null && !isRecord(value.lastEntry)
    || value.awaitingUserResponse !== null && !isRecord(value.awaitingUserResponse)
    || !stringArray(value.memberIds)
    || !stringArray(value.conversationPartnerIds)) return null;
  return { ...value, id: value.id, name: value.name } as RosterSnapshotAgent;
}

function parsePersistedRoster(value: unknown): RosterSnapshotAgent[] | null {
  if (!isRecord(value) || !Array.isArray(value.rows)) return null;
  const rows: RosterSnapshotAgent[] = [];
  const ids = new Set<string>();
  for (const item of value.rows) {
    const row = strictPersistedAgent(item);
    if (row == null || ids.has(row.id)) return null;
    ids.add(row.id);
    rows.push(row);
  }
  return rows;
}

function parseLiveAgent(value: unknown): RosterSnapshotAgent | null {
  if (!isRecord(value) || !nonEmptyString(value.id) || typeof value.name !== "string") return null;
  return { ...value, id: value.id, name: value.name, memberIds: stringArray(value.memberIds) ? value.memberIds : [], conversationPartnerIds: stringArray(value.conversationPartnerIds) ? value.conversationPartnerIds : [] } as RosterSnapshotAgent;
}

export function parseCompleteRosterPayload(value: unknown): RosterSnapshotAgent[] | null {
  if (!Array.isArray(value)) return null;
  const rows: RosterSnapshotAgent[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const row = parseLiveAgent(item);
    if (row == null || ids.has(row.id)) return null;
    ids.add(row.id);
    rows.push(row);
  }
  return rows;
}

function parseAgentsEvent(value: unknown): RosterSnapshotAgent[] | null {
  if (Array.isArray(value)) return parseCompleteRosterPayload(value);
  if (!isRecord(value) || !Array.isArray(value.agents)) return null;
  return parseCompleteRosterPayload(value.agents);
}

function parseUpsertEvent(value: unknown): RosterSnapshotAgent | null {
  if (!isRecord(value)) return null;
  return parseLiveAgent(value.agent ?? value);
}

function parseFailure(reason: unknown): RosterSnapshotFailure {
  if (isRecord(reason)) {
    return {
      code: nonEmptyString(reason.code) ? reason.code : "roster-load-failed",
      message: typeof reason.message === "string" ? reason.message : null,
      transportKind: typeof reason.transportKind === "string" ? reason.transportKind : null
    };
  }
  return { code: "roster-load-failed", message: reason instanceof Error ? reason.message : null, transportKind: null };
}

function accountKey(accountSlot: string): string {
  if (accountSlot.length === 0) throw new Error("accountSlot must not be empty");
  return `sand.client.slice.account.${encodeURIComponent(accountSlot).replaceAll(".", "%2E")}.${ROSTER_SNAPSHOT_SLICE.slice}`;
}

function parsePersistedEnvelope(value: string | null): RosterSnapshotAgent[] | null {
  if (value == null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.schemaVersion !== ROSTER_SNAPSHOT_SLICE.schemaVersion) return null;
    return parsePersistedRoster(parsed.value);
  } catch {
    return null;
  }
}

export function createRosterSnapshotSource(
  client: Pick<ProductionCoordinatorClient, "call" | "subscribe" | "subscribeTransport">,
  persistence: Pick<AgentDesktopBridge["clientPersistence"], "read">
): RosterSnapshotSource {
  return {
    listAgents: () => client.call("listAgents"),
    readPersisted: (accountSlot) => persistence.read(accountKey(accountSlot)),
    subscribeAgents: (listener) => client.subscribe("agents", listener),
    subscribeAgentUpserted: (listener) => client.subscribe("agent-upserted", listener),
    subscribeTransport: (listener) => client.subscribeTransport(listener)
  };
}

const INITIAL_ROSTER_SNAPSHOT: RosterSnapshot = {
  agents: [],
  hasCompleteRoster: false,
  isShowingRestoredRoster: false,
  loadState: "loading",
  failure: null,
  isFetching: false,
  confirmedFetches: 0,
  transport: "connecting"
};

export function createRosterSnapshotStore(input: {
  source: RosterSnapshotSource;
  initialSnapshot?: RosterSnapshot;
}): RosterSnapshotStore {
  let snapshot = input.initialSnapshot ?? INITIAL_ROSTER_SNAPSHOT;
  let accountSlot: string | null = null;
  let generation = 0;
  let connected = false;
  let disposed = false;
  let pendingFetch: Promise<void> | null = null;
  let stopAgents: (() => void) | null = null;
  let stopUpserts: (() => void) | null = null;
  let stopTransport: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const notify = () => { for (const listener of [...listeners]) listener(); };
  const current = (expected: number, expectedAccount: string | null): boolean =>
    !disposed && generation === expected && accountSlot === expectedAccount;
  const setSnapshot = (next: RosterSnapshot) => {
    if (disposed) return;
    snapshot = next;
    notify();
  };
  const ingestComplete = (rows: RosterSnapshotAgent[], expectedGeneration: number | null = null) => {
    if (disposed || expectedGeneration != null && expectedGeneration !== generation) return;
    setSnapshot({
      ...snapshot,
      agents: rows,
      hasCompleteRoster: true,
      isShowingRestoredRoster: false,
      loadState: "ready",
      failure: null,
      isFetching: false,
      confirmedFetches: snapshot.confirmedFetches + (expectedGeneration == null ? 0 : 1)
    });
  };
  const ingestAgents = (value: unknown) => {
    const rows = parseAgentsEvent(value);
    if (rows == null) return;
    ingestComplete(rows);
  };
  const ingestUpsert = (value: unknown) => {
    const row = parseUpsertEvent(value);
    if (row == null) return;
    const rows = snapshot.agents.some((agent) => agent.id === row.id)
      ? snapshot.agents.map((agent) => agent.id === row.id ? row : agent)
      : [...snapshot.agents, row];
    setSnapshot({ ...snapshot, agents: rows, loadState: rows.length > 0 ? "ready" : snapshot.loadState, isShowingRestoredRoster: snapshot.isShowingRestoredRoster });
  };
  const fetchRoster = (): Promise<void> => {
    if (disposed || !connected || accountSlot == null) return Promise.resolve();
    if (pendingFetch != null) return pendingFetch;
    const expectedGeneration = generation;
    const expectedAccount = accountSlot;
    setSnapshot({ ...snapshot, isFetching: true, loadState: snapshot.agents.length > 0 ? "ready" : "loading" });
    const request = input.source.listAgents().then((value) => {
      if (!current(expectedGeneration, expectedAccount)) return;
      const rows = parseCompleteRosterPayload(value);
      if (rows == null) {
        setSnapshot({ ...snapshot, isFetching: false, loadState: snapshot.agents.length > 0 ? "ready" : "error", failure: { code: "malformed-roster", message: null, transportKind: null } });
        return;
      }
      ingestComplete(rows, expectedGeneration);
    }, (reason) => {
      if (!current(expectedGeneration, expectedAccount)) return;
      const failure = parseFailure(reason);
      setSnapshot({ ...snapshot, isFetching: false, loadState: snapshot.agents.length > 0 ? "ready" : "error", failure });
    }).finally(() => {
      if (pendingFetch === request) pendingFetch = null;
    });
    pendingFetch = request;
    return request;
  };
  const restore = async (expectedGeneration: number, expectedAccount: string): Promise<void> => {
    let persisted: string | null;
    try { persisted = await input.source.readPersisted(expectedAccount); } catch { return; }
    if (!current(expectedGeneration, expectedAccount) || snapshot.hasCompleteRoster) return;
    const rows = parsePersistedEnvelope(persisted);
    if (rows == null || rows.length === 0) return;
    setSnapshot({ ...snapshot, agents: rows, isShowingRestoredRoster: true, loadState: "ready" });
  };
  const onTransport = (value: unknown) => {
    if (disposed || (value !== "connected" && value !== "down")) return;
    const transport = value as RosterSnapshotTransportState;
    setSnapshot({ ...snapshot, transport });
    if (transport === "connected" && connected) void fetchRoster();
  };

  return {
    get: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async connect(nextAccountSlot) {
      if (disposed) return;
      generation += 1;
      accountSlot = nextAccountSlot;
      connected = nextAccountSlot != null;
      pendingFetch = null;
      stopAgents?.();
      stopUpserts?.();
      stopTransport?.();
      stopAgents = null;
      stopUpserts = null;
      stopTransport = null;
      snapshot = { ...INITIAL_ROSTER_SNAPSHOT, transport: connected ? "connecting" : "down" };
      notify();
      if (!connected || nextAccountSlot == null) return;
      const expectedGeneration = generation;
      const expectedAccount = nextAccountSlot;
      stopAgents = input.source.subscribeAgents(ingestAgents);
      stopUpserts = input.source.subscribeAgentUpserted(ingestUpsert);
      stopTransport = input.source.subscribeTransport(onTransport);
      await restore(expectedGeneration, expectedAccount);
      if (current(expectedGeneration, expectedAccount)) await fetchRoster();
    },
    noteReconnect() {
      return fetchRoster();
    },
    reset() {
      if (disposed) return;
      generation += 1;
      accountSlot = null;
      connected = false;
      pendingFetch = null;
      stopAgents?.();
      stopUpserts?.();
      stopTransport?.();
      stopAgents = null;
      stopUpserts = null;
      stopTransport = null;
      snapshot = { ...INITIAL_ROSTER_SNAPSHOT, transport: "down" };
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      accountSlot = null;
      connected = false;
      pendingFetch = null;
      stopAgents?.();
      stopUpserts?.();
      stopTransport?.();
      stopAgents = null;
      stopUpserts = null;
      stopTransport = null;
      listeners.clear();
    }
  };
}
