export type HerdrAgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";
export type BotRuntimeStatus = HerdrAgentStatus | "offline";

export interface BotRuntime {
  readonly status: BotRuntimeStatus;
  readonly paneId: string | null;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly kind: string | null;
}

export const OFFLINE_RUNTIME: BotRuntime = { status: "offline", paneId: null, workspaceId: null, sessionId: null, kind: null };

export interface HerdrAgentInfo {
  readonly name: string | null;
  readonly agent: string | null;
  readonly agent_status: HerdrAgentStatus;
  readonly pane_id: string;
  readonly tab_id: string | null;
  readonly workspace_id: string | null;
  readonly cwd: string | null;
  readonly agent_session: { readonly value: string } | null;
}

const STATUSES: ReadonlySet<string> = new Set(["idle", "working", "blocked", "done", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function projectHerdrAgentInfo(value: unknown): HerdrAgentInfo | null {
  if (!isRecord(value) || typeof value.pane_id !== "string") return null;
  const status = typeof value.agent_status === "string" && STATUSES.has(value.agent_status) ? (value.agent_status as HerdrAgentStatus) : "unknown";
  const session = isRecord(value.agent_session) && typeof value.agent_session.value === "string" ? { value: value.agent_session.value } : null;
  return {
    name: stringOrNull(value.name),
    agent: stringOrNull(value.agent),
    agent_status: status,
    pane_id: value.pane_id,
    tab_id: stringOrNull(value.tab_id),
    workspace_id: stringOrNull(value.workspace_id),
    cwd: stringOrNull(value.cwd),
    agent_session: session,
  };
}

export function runtimeFromAgentInfo(info: HerdrAgentInfo): BotRuntime {
  return { status: info.agent_status, paneId: info.pane_id, workspaceId: info.workspace_id, sessionId: info.agent_session?.value ?? null, kind: info.agent };
}

export class HerdrError extends Error {
  readonly code: string;
  readonly detail: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "HerdrError";
    this.code = code;
    this.detail = detail;
  }
}
