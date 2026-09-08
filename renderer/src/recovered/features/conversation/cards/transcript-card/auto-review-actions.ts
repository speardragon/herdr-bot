import type { DesktopAutoReviewInstructions } from "../../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/view-QqBtBG74.js#byteOffset=2575 (Always-allow persistence fallback)
// @evidence src/app/dist/renderer/assets/view-QqBtBG74.js#byteOffset=2771 (approval resolution and stale projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=827983 (resolveAutoReviewApproval action facade)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=824522 (autoReviewInstructions resource)

export type AutoReviewResolution = "approved" | "always" | "denied";
export type AutoReviewTransportResolution = Exclude<AutoReviewResolution, "always">;
export type AutoReviewSettledStatus = AutoReviewResolution | "expired";

export interface AutoReviewApprovalInstructionsSnapshotStore {
  get(): AutoReviewInstructionsSnapshot;
  subscribe(listener: () => void): () => void;
}

export type AutoReviewInstructionsSnapshot =
  | { status: "loading"; previous?: DesktopAutoReviewInstructions }
  | { status: "ready"; value: DesktopAutoReviewInstructions }
  | { status: "failed"; failure: unknown; previous?: DesktopAutoReviewInstructions }
  | { status: "empty" | "unavailable" };

export interface AutoReviewInstructionsResource {
  snapshots: AutoReviewApprovalInstructionsSnapshotStore;
  load(): Promise<void>;
  setInstructions(instructions: DesktopAutoReviewInstructions): Promise<void>;
}

export interface ResolveAutoReviewApprovalInput {
  entryId: string;
  requestId: string;
  resolution: AutoReviewTransportResolution;
  agentId: string;
}

export interface AutoReviewApprovalResolver {
  resolveAutoReviewApproval(input: ResolveAutoReviewApprovalInput): Promise<"resolved" | "stale">;
}

export interface AutoReviewApprovalActionInput {
  entryId: string;
  requestId: string;
  agentId: string | null;
  status: AutoReviewSettledStatus | "pending";
  proposedRule?: string;
}

export type AutoReviewApprovalActionState =
  | { status: "pending" }
  | { status: "submitting"; resolution: AutoReviewResolution }
  | { status: "settled"; resolution: AutoReviewSettledStatus }
  | { status: "stale" }
  | { status: "failed"; error: unknown };

export interface AutoReviewApprovalActions {
  getState(): AutoReviewApprovalActionState;
  subscribe(listener: () => void): () => void;
  resolve(resolution: AutoReviewResolution): Promise<AutoReviewApprovalActionState>;
  dispose(): void;
}

const MAX_INSTRUCTIONS = 20;
const MAX_INSTRUCTION_LENGTH = 1000;

function boundedInstruction(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= MAX_INSTRUCTION_LENGTH ? trimmed : trimmed.slice(0, MAX_INSTRUCTION_LENGTH);
}

function normalizedInstructions(value: DesktopAutoReviewInstructions): DesktopAutoReviewInstructions {
  const normalizeList = (items: unknown): string[] => {
    if (!Array.isArray(items)) return [];
    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (typeof item !== "string") continue;
      const bounded = boundedInstruction(item);
      if (bounded.length === 0 || seen.has(bounded)) continue;
      seen.add(bounded);
      result.push(bounded);
      if (result.length >= MAX_INSTRUCTIONS) break;
    }
    return result;
  };
  return {
    isEnabled: value.isEnabled !== false,
    allowInstructions: normalizeList(value.allowInstructions),
    blockInstructions: normalizeList(value.blockInstructions),
  };
}

export function appendAutoReviewAllowInstruction(
  instructions: DesktopAutoReviewInstructions,
  proposedRule: string,
): DesktopAutoReviewInstructions {
  const nextRule = boundedInstruction(proposedRule);
  if (nextRule.length === 0 || instructions.allowInstructions.some((item) => item === nextRule)) return instructions;
  const allowInstructions = [...instructions.allowInstructions, nextRule];
  return normalizedInstructions({
    ...instructions,
    allowInstructions: allowInstructions.length <= MAX_INSTRUCTIONS ? allowInstructions : allowInstructions.slice(-MAX_INSTRUCTIONS),
  });
}

function redactProposedRule(value: string): string | undefined {
  const redacted = value
    .replace(/https?:\/\/[^\s"'`]+/gi, (candidate) => {
      try {
        const normalized = new URL(candidate).href.replace(/^(https?:\/\/)[^/?#]*@/i, "$1");
        return normalized.split("#")[0]?.split("?")[0] ?? normalized;
      } catch {
        return candidate;
      }
    })
    .replace(/((?:--)?(?:api[_-]?key|authorization|credential|password|secret|signature|token)\s*(?:=|:|\s)\s*)(?:"[^"]*"|'[^']*'|[^\s]+)/gi, "$1…")
    .replace(/\bBearer\s+[^\s"'`]+/gi, "Bearer …")
    .replace(/\b(?:sk[-_]|gh[pousr]_|xox[baprs]-|AIza)[A-Za-z0-9+/_=-]+/gi, "…")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > 0 ? redacted : undefined;
}

function snapshotValue(resource: AutoReviewInstructionsResource): DesktopAutoReviewInstructions | undefined {
  const snapshot = resource.snapshots.get();
  if (snapshot.status === "ready") return snapshot.value;
  if (snapshot.status === "loading" || snapshot.status === "failed") return snapshot.previous;
  return undefined;
}

export function createAutoReviewApprovalActions(
  input: AutoReviewApprovalActionInput,
  dependencies: { resolver: AutoReviewApprovalResolver; instructions: AutoReviewInstructionsResource },
): AutoReviewApprovalActions {
  let state: AutoReviewApprovalActionState = input.status === "pending"
    ? { status: "pending" }
    : { status: "settled", resolution: input.status };
  const listeners = new Set<() => void>();
  let disposed = false;
  let generation = 0;
  let inFlight: Promise<AutoReviewApprovalActionState> | null = null;

  const publish = (next: AutoReviewApprovalActionState) => {
    if (disposed || Object.is(next, state)) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const loadAlwaysAllow = async (): Promise<{ transport: AutoReviewTransportResolution; settled: AutoReviewResolution }> => {
    const proposedRule = input.proposedRule == null ? undefined : redactProposedRule(input.proposedRule);
    if (proposedRule === undefined) return { transport: "approved", settled: "approved" };
    try {
      await dependencies.instructions.load();
      const current = snapshotValue(dependencies.instructions);
      if (current == null) return { transport: "approved", settled: "approved" };
      await dependencies.instructions.setInstructions(appendAutoReviewAllowInstruction(current, proposedRule));
      return { transport: "approved", settled: "always" };
    } catch {
      return { transport: "approved", settled: "approved" };
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resolve(resolution) {
      if (inFlight != null) return inFlight;
      if (disposed || input.agentId == null || state.status !== "pending") return Promise.resolve(state);
      const requestGeneration = generation;
      publish({ status: "submitting", resolution });
      const operation = (async () => {
        const effective = resolution === "always"
          ? await loadAlwaysAllow()
          : { transport: resolution, settled: resolution };
        try {
          const result = await dependencies.resolver.resolveAutoReviewApproval({
            agentId: input.agentId as string,
            entryId: input.entryId,
            requestId: input.requestId,
            resolution: effective.transport,
          });
          if (disposed || requestGeneration !== generation) return state;
          const next = result === "stale"
            ? { status: "stale" as const }
            : { status: "settled" as const, resolution: effective.settled };
          publish(next);
          return next;
        } catch (error) {
          if (disposed || requestGeneration !== generation) return state;
          const next = { status: "failed" as const, error };
          publish(next);
          return next;
        } finally {
          inFlight = null;
        }
      })();
      inFlight = operation;
      return operation;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      listeners.clear();
      inFlight = null;
    },
  };
}
