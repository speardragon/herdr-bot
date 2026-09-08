import type { RawPortCoordinatorSource } from "../recovered/runtime/coordinator-source";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523

export interface CommandPaletteRoutine {
  readonly agentId: string;
  readonly automation: {
    readonly id: string;
    readonly name: string;
    readonly triggerDescription: string;
    readonly createdAt: number;
    readonly lastRunAt: number | null;
  };
}

export type CommandPaletteRoutineSnapshot =
  | { readonly status: "loading"; readonly value: readonly CommandPaletteRoutine[] }
  | { readonly status: "ready"; readonly value: readonly CommandPaletteRoutine[] }
  | { readonly status: "empty"; readonly value: readonly [] }
  | { readonly status: "failed"; readonly value: readonly CommandPaletteRoutine[]; readonly error: string }
  | { readonly status: "unavailable"; readonly value: readonly [] }
  | { readonly status: "cancelled"; readonly value: readonly CommandPaletteRoutine[] };

export interface CommandPaletteRoutineProvider {
  getSnapshot(): CommandPaletteRoutineSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<CommandPaletteRoutineSnapshot>;
  cancel(): void;
  reset(): void;
  dispose(): void;
}

type RoutineSource = Pick<RawPortCoordinatorSource, "listAllAutomations">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function routineFromCoordinator(value: unknown): CommandPaletteRoutine | null {
  if (!isRecord(value) || typeof value.agentId !== "string" || value.agentId.length === 0 || !isRecord(value.automation)) return null;
  const automation = value.automation;
  if (
    typeof automation.id !== "string" || automation.id.length === 0 ||
    typeof automation.name !== "string" ||
    typeof automation.triggerDescription !== "string" ||
    !isTimestamp(automation.createdAt) ||
    !(automation.lastRunAt === null || isTimestamp(automation.lastRunAt))
  ) return null;
  return {
    agentId: value.agentId,
    automation: {
      id: automation.id,
      name: automation.name,
      triggerDescription: automation.triggerDescription,
      createdAt: automation.createdAt,
      lastRunAt: automation.lastRunAt
    }
  };
}

export function commandPaletteRoutinesFromCoordinator(value: unknown): CommandPaletteRoutine[] {
  return Array.isArray(value) ? value.flatMap((candidate) => {
    const routine = routineFromCoordinator(candidate);
    return routine == null ? [] : [routine];
  }) : [];
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
export function commandPaletteRoutineSearchText(routine: CommandPaletteRoutine): string[] {
  return [routine.automation.name, routine.automation.triggerDescription];
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
export function commandPaletteRoutineRecency(routine: CommandPaletteRoutine): number | null {
  const timestamp = routine.automation.lastRunAt ?? routine.automation.createdAt;
  return timestamp > 0 ? timestamp : null;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
export function activateCommandPaletteRoutine(routine: CommandPaletteRoutine, onOpenRoutine: (agentId: string) => void): void {
  onOpenRoutine(routine.agentId);
}

function previousValue(snapshot: CommandPaletteRoutineSnapshot): readonly CommandPaletteRoutine[] {
  return snapshot.status === "empty" || snapshot.status === "unavailable" ? [] : snapshot.value;
}

function isUnavailable(error: unknown): boolean {
  return isRecord(error) && error.code === "source/capability-unavailable";
}

export function createCommandPaletteRoutineProvider(source: RoutineSource): CommandPaletteRoutineProvider {
  const listeners = new Set<() => void>();
  let snapshot: CommandPaletteRoutineSnapshot = { status: "empty", value: [] };
  let requestId = 0;
  let controller: AbortController | null = null;
  let disposed = false;
  const publish = (next: CommandPaletteRoutineSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const cancel = () => {
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
    async refresh(): Promise<CommandPaletteRoutineSnapshot> {
      if (disposed) return { status: "cancelled", value: previousValue(snapshot) };
      cancel();
      const currentRequestId = requestId;
      const nextController = new AbortController();
      controller = nextController;
      const previous = previousValue(snapshot);
      publish({ status: "loading", value: previous });
      try {
        const raw = await source.listAllAutomations({ signal: nextController.signal });
        if (disposed || currentRequestId !== requestId || nextController.signal.aborted) return { status: "cancelled", value: previous };
        const routines = commandPaletteRoutinesFromCoordinator(raw);
        const next: CommandPaletteRoutineSnapshot = routines.length === 0 ? { status: "empty", value: [] } : { status: "ready", value: routines };
        publish(next);
        return next;
      } catch (error) {
        if (disposed || currentRequestId !== requestId || nextController.signal.aborted) return { status: "cancelled", value: previous };
        const next: CommandPaletteRoutineSnapshot = isUnavailable(error)
          ? { status: "unavailable", value: [] as const }
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
      cancel();
      publish({ status: "cancelled", value: previous });
    },
    reset() {
      if (disposed) return;
      cancel();
      publish({ status: "empty", value: [] });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      listeners.clear();
    }
  };
}
