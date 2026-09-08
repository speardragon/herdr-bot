import type { TranscriptCardScope } from "./protocol";

// @evidence src/app/dist/renderer/assets/view-HYU0bFxa.js#byteOffset=502 (secret request state and submit lifecycle)
// @evidence src/app/dist/renderer/assets/view-HYU0bFxa.js#byteOffset=583 (exact submitSecret payload)
// @evidence src/app/dist/renderer/assets/view-HYU0bFxa.js#byteOffset=6194 (secretProvided projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=825091 (transcript action provider forwards submitSecret)

export interface SecretRequestEntry {
  readonly kind: "send-message";
  readonly id: string;
  readonly message: {
    readonly type: "secret-request";
    readonly secretRequest: {
      readonly label: string;
      readonly description?: string;
    };
  };
  readonly secretProvided?: boolean;
}

export interface SubmitSecretInput {
  readonly entryId: string;
  readonly value: string;
  readonly agentId: string;
}

export interface SecretRequestTransport {
  submitSecret(input: SubmitSecretInput): Promise<void>;
}

export interface SecretRequestCallSource {
  call(method: string, args?: unknown): Promise<unknown>;
}

export function createSecretRequestTransport(source: SecretRequestCallSource): SecretRequestTransport {
  return {
    async submitSecret(input) {
      await source.call("submitSecret", input);
    },
  };
}

export type SecretRequestActionState = "idle" | "pending" | "settled" | "provided";

export interface SecretRequestActionSnapshot {
  readonly entryId: string;
  readonly scope: TranscriptCardScope;
  readonly state: SecretRequestActionState;
}

export type SecretRequestActionResult =
  | { readonly kind: "settled"; readonly snapshot: SecretRequestActionSnapshot }
  | { readonly kind: "provided"; readonly snapshot: SecretRequestActionSnapshot }
  | { readonly kind: "stale"; readonly snapshot: SecretRequestActionSnapshot }
  | { readonly kind: "failed"; readonly snapshot: SecretRequestActionSnapshot }
  | { readonly kind: "ignored"; readonly reason: "unavailable" | "not-secret-request" | "empty" | "pending" | "provided"; readonly snapshot: SecretRequestActionSnapshot };

export interface SecretRequestActionAdapterOptions {
  readonly scope: TranscriptCardScope;
  readonly transport: SecretRequestTransport;
}

export interface SecretRequestActionAdapter {
  getSnapshot(entryId: string): SecretRequestActionSnapshot;
  subscribe(listener: () => void): () => void;
  replaceEntries(entries: readonly SecretRequestEntry[]): void;
  submit(entryId: string, value: string): Promise<SecretRequestActionResult>;
  setScope(scope: TranscriptCardScope): void;
  dispose(): void;
}

function cloneScope(scope: TranscriptCardScope): TranscriptCardScope {
  return { accountSlot: scope.accountSlot, agentId: scope.agentId };
}

function sameScope(left: TranscriptCardScope, right: TranscriptCardScope): boolean {
  return left.accountSlot === right.accountSlot && left.agentId === right.agentId;
}

function emptySnapshot(entryId: string, scope: TranscriptCardScope): SecretRequestActionSnapshot {
  return { entryId, scope: cloneScope(scope), state: "idle" };
}

function snapshotForEntry(entry: SecretRequestEntry, scope: TranscriptCardScope, state: SecretRequestActionState = "idle"): SecretRequestActionSnapshot {
  return { entryId: entry.id, scope: cloneScope(scope), state: entry.secretProvided === true ? "provided" : state };
}

export function createSecretRequestActionAdapter(options: SecretRequestActionAdapterOptions): SecretRequestActionAdapter {
  let scope = cloneScope(options.scope);
  let entries = new Map<string, SecretRequestEntry>();
  let snapshots = new Map<string, SecretRequestActionSnapshot>();
  const listeners = new Set<() => void>();
  let generation = 0;
  let disposed = false;

  const emit = () => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };
  const current = (entryId: string): SecretRequestActionSnapshot => snapshots.get(entryId) ?? emptySnapshot(entryId, scope);
  const secretEntry = (entryId: string): SecretRequestEntry | null => entries.get(entryId) ?? null;
  const isCurrent = (entryId: string, token: number, actionScope: TranscriptCardScope): boolean =>
    !disposed && token === generation && sameScope(actionScope, scope) && entries.has(entryId);

  return {
    getSnapshot(entryId) {
      return current(entryId);
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replaceEntries(nextEntries) {
      if (disposed) return;
      entries = new Map(nextEntries.map((entry) => [entry.id, entry]));
      const nextSnapshots = new Map<string, SecretRequestActionSnapshot>();
      for (const entry of entries.values()) {
        const previous = snapshots.get(entry.id);
        nextSnapshots.set(entry.id, snapshotForEntry(entry, scope, previous?.state === "pending" || previous?.state === "settled" ? previous.state : "idle"));
      }
      snapshots = nextSnapshots;
      emit();
    },
    async submit(entryId, value) {
      if (disposed || scope.agentId == null) return { kind: "ignored", reason: "unavailable", snapshot: current(entryId) };
      const entry = secretEntry(entryId);
      if (entry == null) return { kind: "ignored", reason: "not-secret-request", snapshot: current(entryId) };
      const before = current(entryId);
      if (before.state === "provided") return { kind: "ignored", reason: "provided", snapshot: before };
      if (before.state === "pending") return { kind: "ignored", reason: "pending", snapshot: before };
      const trimmed = value.trim();
      if (trimmed.length === 0) return { kind: "ignored", reason: "empty", snapshot: before };

      const actionScope = cloneScope(scope);
      const token = generation;
      const pending = { ...before, state: "pending" as const };
      snapshots.set(entryId, pending);
      emit();
      try {
        await options.transport.submitSecret({ entryId, value: trimmed, agentId: actionScope.agentId as string });
        if (!isCurrent(entryId, token, actionScope)) return { kind: "stale", snapshot: current(entryId) };
        const latestEntry = secretEntry(entryId);
        const settled = snapshotForEntry(latestEntry ?? entry, scope, "settled");
        snapshots.set(entryId, settled);
        emit();
        return settled.state === "provided" ? { kind: "provided", snapshot: settled } : { kind: "settled", snapshot: settled };
      } catch {
        if (!isCurrent(entryId, token, actionScope)) return { kind: "stale", snapshot: current(entryId) };
        snapshots.set(entryId, { ...before, state: "idle" });
        emit();
        return { kind: "failed", snapshot: current(entryId) };
      }
    },
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      generation += 1;
      scope = cloneScope(nextScope);
      entries = new Map();
      snapshots = new Map();
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      entries.clear();
      snapshots.clear();
      listeners.clear();
    },
  };
}
