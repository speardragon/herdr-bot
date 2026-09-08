import type { RawPortCoordinatorSource } from "../recovered/runtime/coordinator-source";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5508686
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5504500

export const COMMAND_PALETTE_MESSAGE_SEARCH_DEBOUNCE_MS = 150;

export type CommandPaletteMessageRole = "user" | "assistant";

export interface CommandPaletteMessage {
  readonly agentId: string;
  readonly entryId: string;
  readonly role: CommandPaletteMessageRole;
  readonly timestampMs: number;
  readonly snippet: string;
}

export type CommandPaletteMessageSnapshot =
  | { readonly status: "loading"; readonly value: readonly CommandPaletteMessage[] }
  | { readonly status: "ready"; readonly value: readonly CommandPaletteMessage[] }
  | { readonly status: "empty"; readonly value: readonly [] }
  | { readonly status: "failed"; readonly value: readonly CommandPaletteMessage[]; readonly error: string }
  | { readonly status: "unavailable"; readonly value: readonly [] }
  | { readonly status: "cancelled"; readonly value: readonly CommandPaletteMessage[] };

export interface CommandPaletteMessageProvider {
  getSnapshot(): CommandPaletteMessageSnapshot;
  subscribe(listener: () => void): () => void;
  setAvailable(available: boolean): void;
  setQuery(query: string): Promise<CommandPaletteMessageSnapshot>;
  cancel(): void;
  reset(): void;
  dispose(): void;
}

type MessageSource = Pick<RawPortCoordinatorSource, "searchAgents">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function messageFromSearch(value: unknown): CommandPaletteMessage | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.agentId !== "string" || value.agentId.length === 0 ||
    typeof value.entryId !== "string" || value.entryId.length === 0 ||
    (value.role !== "user" && value.role !== "assistant") ||
    !isFiniteNumber(value.timestampMs) ||
    typeof value.snippet !== "string"
  ) return null;
  return {
    agentId: value.agentId,
    entryId: value.entryId,
    role: value.role,
    timestampMs: value.timestampMs,
    snippet: value.snippet
  };
}

export function commandPaletteMessagesFromSearch(value: unknown): CommandPaletteMessage[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const messages: CommandPaletteMessage[] = [];
  for (const candidate of value) {
    const message = messageFromSearch(candidate);
    if (message == null) continue;
    const identity = `${message.agentId}:${message.entryId}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    messages.push(message);
  }
  return messages;
}

function previousValue(snapshot: CommandPaletteMessageSnapshot): readonly CommandPaletteMessage[] {
  return snapshot.status === "empty" || snapshot.status === "unavailable" ? [] : snapshot.value;
}

function isUnavailable(error: unknown): boolean {
  return isRecord(error) && error.code === "source/capability-unavailable";
}

export function createCommandPaletteMessageProvider(source: MessageSource): CommandPaletteMessageProvider {
  const listeners = new Set<() => void>();
  let snapshot: CommandPaletteMessageSnapshot = { status: "unavailable", value: [] };
  let requestId = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolve: ((snapshot: CommandPaletteMessageSnapshot) => void) | null = null;
  let pendingPrevious: readonly CommandPaletteMessage[] = [];
  let available = false;
  let disposed = false;

  const publish = (next: CommandPaletteMessageSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const cancelRequest = () => {
    requestId += 1;
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    controller?.abort();
    controller = null;
    pendingResolve?.({ status: "cancelled", value: pendingPrevious });
    pendingResolve = null;
    pendingPrevious = [];
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAvailable(nextAvailable) {
      if (disposed || available === nextAvailable) return;
      cancelRequest();
      available = nextAvailable;
      publish(available ? { status: "empty", value: [] } : { status: "unavailable", value: [] });
    },
    setQuery(query) {
      if (disposed || !available) return Promise.resolve({ status: "unavailable", value: [] });
      const normalized = query.trim();
      cancelRequest();
      if (normalized.length === 0) {
        publish({ status: "empty", value: [] });
        return Promise.resolve({ status: "empty", value: [] });
      }

      const previous = previousValue(snapshot);
      publish({ status: "loading", value: previous });
      const currentRequestId = requestId;
      pendingPrevious = previous;
      return new Promise<CommandPaletteMessageSnapshot>((resolve) => {
        pendingResolve = resolve;
        timer = setTimeout(async () => {
          timer = null;
          const nextController = new AbortController();
          controller = nextController;
          try {
            // @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5507395
            const raw = await source.searchAgents({ query: normalized }, { signal: nextController.signal });
            if (disposed || currentRequestId !== requestId || nextController.signal.aborted) {
              resolve({ status: "cancelled", value: previous });
              return;
            }
            const messages = commandPaletteMessagesFromSearch(raw);
            const next: CommandPaletteMessageSnapshot = messages.length === 0 ? { status: "empty", value: [] } : { status: "ready", value: messages };
            pendingResolve = null;
            publish(next);
            resolve(next);
          } catch (error) {
            if (disposed || currentRequestId !== requestId || nextController.signal.aborted) {
              resolve({ status: "cancelled", value: previous });
              return;
            }
            const next: CommandPaletteMessageSnapshot = isUnavailable(error)
              ? { status: "unavailable", value: [] }
              : { status: "failed", value: previous, error: error instanceof Error ? error.message : String(error) };
            pendingResolve = null;
            publish(next);
            resolve(next);
          } finally {
            if (controller === nextController) controller = null;
          }
        }, COMMAND_PALETTE_MESSAGE_SEARCH_DEBOUNCE_MS);
      });
    },
    cancel() {
      if (disposed) return;
      const previous = previousValue(snapshot);
      cancelRequest();
      publish({ status: "cancelled", value: previous });
    },
    reset() {
      if (disposed) return;
      cancelRequest();
      publish(available ? { status: "empty", value: [] } : { status: "unavailable", value: [] });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelRequest();
      listeners.clear();
    }
  };
}
