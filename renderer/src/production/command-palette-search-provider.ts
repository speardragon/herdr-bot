import type { RawPortCoordinatorSource } from "../recovered/runtime/coordinator-source";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5508686
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5521060
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5532244

export const COMMAND_PALETTE_FILE_RESULT_LIMIT = 50;

export type CommandPaletteFileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "markdown"
  | "table"
  | "json"
  | "text"
  | "document"
  | "archive"
  | "file";

export interface CommandPaletteFile {
  readonly agentId: string;
  readonly entryId: string;
  readonly fileName: string;
  readonly ext: string;
  readonly mime: string | null;
  readonly kind: CommandPaletteFileKind;
  readonly timestampMs: number;
  readonly width: number | null;
  readonly height: number | null;
}

export type CommandPaletteFileSnapshot =
  | { readonly status: "loading"; readonly value: readonly CommandPaletteFile[] }
  | { readonly status: "ready"; readonly value: readonly CommandPaletteFile[] }
  | { readonly status: "empty"; readonly value: readonly [] }
  | { readonly status: "failed"; readonly value: readonly CommandPaletteFile[]; readonly error: string }
  | { readonly status: "unavailable"; readonly value: readonly [] }
  | { readonly status: "cancelled"; readonly value: readonly CommandPaletteFile[] };

export interface CommandPaletteFileProvider {
  getSnapshot(): CommandPaletteFileSnapshot;
  subscribe(listener: () => void): () => void;
  setAvailable(available: boolean): void;
  setQuery(query: string): Promise<CommandPaletteFileSnapshot>;
  cancel(): void;
  reset(): void;
  dispose(): void;
}

type FileSource = Pick<RawPortCoordinatorSource, "searchMedia">;

const FILE_KINDS = new Set<CommandPaletteFileKind>([
  "image", "video", "audio", "pdf", "markdown", "table", "json", "text", "document", "archive", "file"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : isFiniteNumber(value) ? value : Number.NaN;
}

function fileFromCoordinator(value: unknown): CommandPaletteFile | null {
  if (!isRecord(value)) return null;
  const width = nullableNumber(value.width);
  const height = nullableNumber(value.height);
  if (
    typeof value.agentId !== "string" || value.agentId.length === 0 ||
    typeof value.entryId !== "string" || value.entryId.length === 0 ||
    typeof value.fileName !== "string" || value.fileName.length === 0 ||
    typeof value.ext !== "string" ||
    typeof value.mime !== "string" && value.mime !== null ||
    typeof value.kind !== "string" || !FILE_KINDS.has(value.kind as CommandPaletteFileKind) ||
    !isFiniteNumber(value.timestampMs) ||
    Number.isNaN(width) || Number.isNaN(height)
  ) return null;
  return {
    agentId: value.agentId,
    entryId: value.entryId,
    fileName: value.fileName,
    ext: value.ext,
    mime: value.mime,
    kind: value.kind as CommandPaletteFileKind,
    timestampMs: value.timestampMs,
    width,
    height
  };
}

export function commandPaletteFilesFromCoordinator(value: unknown): CommandPaletteFile[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const files: CommandPaletteFile[] = [];
  for (const candidate of value) {
    const file = fileFromCoordinator(candidate);
    if (file == null) continue;
    const identity = `${file.agentId}:${file.entryId}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    files.push(file);
  }
  return files;
}

function previousValue(snapshot: CommandPaletteFileSnapshot): readonly CommandPaletteFile[] {
  return snapshot.status === "empty" || snapshot.status === "unavailable" ? [] : snapshot.value;
}

function isUnavailable(error: unknown): boolean {
  return isRecord(error) && error.code === "source/capability-unavailable";
}

export function createCommandPaletteFileProvider(
  source: FileSource,
  limit = COMMAND_PALETTE_FILE_RESULT_LIMIT
): CommandPaletteFileProvider {
  const listeners = new Set<() => void>();
  let snapshot: CommandPaletteFileSnapshot = { status: "unavailable", value: [] };
  let requestId = 0;
  let controller: AbortController | null = null;
  let available = false;
  let disposed = false;
  const publish = (next: CommandPaletteFileSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const cancelRequest = () => {
    requestId += 1;
    controller?.abort();
    controller = null;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAvailable(nextAvailable) {
      if (disposed || available === nextAvailable) return;
      available = nextAvailable;
      cancelRequest();
      publish(available ? { status: "empty", value: [] } : { status: "unavailable", value: [] });
    },
    async setQuery(query) {
      if (disposed || !available) return { status: "unavailable", value: [] };
      cancelRequest();
      const currentRequestId = requestId;
      const nextController = new AbortController();
      controller = nextController;
      const previous = previousValue(snapshot);
      publish({ status: "loading", value: previous });
      try {
        const raw = await source.searchMedia({ query: query.trim(), limit }, { signal: nextController.signal });
        if (disposed || currentRequestId !== requestId || nextController.signal.aborted) return { status: "cancelled", value: previous };
        const files = commandPaletteFilesFromCoordinator(raw);
        const next: CommandPaletteFileSnapshot = files.length === 0 ? { status: "empty", value: [] } : { status: "ready", value: files };
        publish(next);
        return next;
      } catch (error) {
        if (disposed || currentRequestId !== requestId || nextController.signal.aborted) return { status: "cancelled", value: previous };
        const next: CommandPaletteFileSnapshot = isUnavailable(error)
          ? { status: "unavailable", value: [] }
          : { status: "failed", value: previous, error: error instanceof Error ? error.message : String(error) };
        publish(next);
        return next;
      } finally {
        if (controller === nextController) controller = null;
      }
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
