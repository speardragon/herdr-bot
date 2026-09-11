import { execFile } from "node:child_process";
import { HerdrError, projectHerdrAgentInfo, type HerdrAgentInfo, type HerdrAgentStatus } from "./types.ts";

export interface HerdrSessionInfo {
  readonly name: string;
  readonly running: boolean;
  readonly socketPath: string;
}

export interface HerdrCli {
  sessionList(): Promise<HerdrSessionInfo[]>;
  agentList(): Promise<HerdrAgentInfo[]>;
  agentGet(target: string): Promise<HerdrAgentInfo>;
  agentStart(args: { name: string; kind: string; paneId: string; agentArgs: readonly string[]; timeoutMs?: number }): Promise<HerdrAgentInfo>;
  agentPrompt(args: { target: string; text: string; wait: boolean; until?: readonly HerdrAgentStatus[]; timeoutMs?: number }): Promise<HerdrAgentInfo | null>;
  agentRename(target: string, name: string | null): Promise<void>;
  agentFocus(target: string): Promise<void>;
  agentRead(target: string, lines: number): Promise<string>;
  workspaceList(): Promise<{ workspace_id: string; label: string }[]>;
  workspaceCreate(args: { cwd: string; label: string }): Promise<{ workspaceId: string; rootPaneId: string }>;
  tabCreate(args: { workspaceId: string; cwd: string; label: string }): Promise<{ tabId: string; rootPaneId: string }>;
  paneClose(paneId: string): Promise<void>;
  notify(title: string, body: string): Promise<void>;
}

const MAX_BUFFER = 16 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function herdrErrorFromPayload(parsed: unknown, fallback: string): HerdrError {
  const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : parsed;
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "herdr_error";
  const message = isRecord(error) && typeof error.message === "string" ? error.message : fallback;
  return new HerdrError(code, message, parsed);
}

function errorFromStderr(stderr: string, fallback: string): HerdrError {
  const line = stderr.trim().split("\n").find((candidate) => candidate.startsWith("{"));
  if (line != null) {
    try {
      return herdrErrorFromPayload(JSON.parse(line), fallback);
    } catch {
      // fall through to a generic error
    }
  }
  return new HerdrError("herdr_error", stderr.trim().length > 0 ? stderr.trim() : fallback);
}

function parseJsonOutput(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

export interface RawHerdrRunnerOptions {
  /** Hard kill timeout for this one invocation, in ms. Only applied where the caller opts in (e.g. `agent list`) — long-running calls like `agent prompt --wait` must not inherit it. */
  readonly timeoutMs?: number;
}

export interface RawHerdrRunner {
  (args: readonly string[], options?: RawHerdrRunnerOptions): Promise<{ stdout: string; stderr: string; code: number }>;
}

export function createExecFileRunner(binPath: string, env: NodeJS.ProcessEnv): RawHerdrRunner {
  return (args, options) => new Promise((resolve, reject) => {
    execFile(binPath, [...args], { env, maxBuffer: MAX_BUFFER, encoding: "utf8", ...(options?.timeoutMs == null ? {} : { timeout: options.timeoutMs }) }, (error, stdout, stderr) => {
      if (error != null && (error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new HerdrError("herdr_spawn_failed", `cannot run herdr binary at ${binPath}`));
        return;
      }
      if (error != null && (error as { killed?: boolean }).killed === true && (error as { code?: unknown }).code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        reject(new HerdrError("herdr_timeout", `herdr ${args.join(" ")} timed out`));
        return;
      }
      if (error != null && typeof (error as { code?: unknown }).code !== "number" && stdout.length === 0 && stderr.length === 0) {
        reject(new HerdrError("herdr_spawn_failed", error.message));
        return;
      }
      const code = error == null ? 0 : typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : 1;
      resolve({ stdout, stderr, code });
    });
  });
}

async function runJson(runner: RawHerdrRunner, args: readonly string[], options?: RawHerdrRunnerOptions): Promise<Record<string, unknown>> {
  const { stdout, stderr, code } = await runner(args, options);
  if (code !== 0) throw errorFromStderr(stderr, `herdr ${args.join(" ")} exited with ${code}`);
  const parsed = parseJsonOutput(stdout);
  // herdr reports some failures (e.g. server_not_running) as an error object on stdout with exit 0.
  if (isRecord(parsed) && isRecord(parsed.error)) throw herdrErrorFromPayload(parsed, `herdr ${args.join(" ")} failed`);
  const result = isRecord(parsed) && isRecord(parsed.result) ? parsed.result : null;
  if (result == null) throw new HerdrError("herdr_bad_json", `herdr ${args.slice(0, 2).join(" ")} returned non-JSON output: ${stdout.slice(0, 200)}`);
  return result;
}

/** `session list --json` prints a bare `{ sessions: [...] }` payload, not the `{ id, result }` envelope. */
async function runSessionList(runner: RawHerdrRunner): Promise<HerdrSessionInfo[]> {
  const args = ["session", "list", "--json"];
  const { stdout, stderr, code } = await runner(args);
  if (code !== 0) throw errorFromStderr(stderr, `herdr ${args.join(" ")} exited with ${code}`);
  const parsed = parseJsonOutput(stdout);
  if (isRecord(parsed) && isRecord(parsed.error)) throw herdrErrorFromPayload(parsed, "herdr session list failed");
  const sessions = isRecord(parsed) && Array.isArray(parsed.sessions) ? parsed.sessions : null;
  if (sessions == null) throw new HerdrError("herdr_bad_json", `herdr session list returned non-JSON output: ${stdout.slice(0, 200)}`);
  return sessions.flatMap((value) => isRecord(value) && typeof value.name === "string" && typeof value.socket_path === "string"
    ? [{ name: value.name, running: value.running === true, socketPath: value.socket_path }]
    : []);
}

function requireAgent(result: Record<string, unknown>, context: string): HerdrAgentInfo {
  const agent = projectHerdrAgentInfo(result.agent);
  if (agent == null) throw new HerdrError("herdr_bad_json", `${context}: result.agent is malformed`);
  return agent;
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) throw new HerdrError("herdr_bad_json", `${context} is missing`);
  return value;
}

function agentStartArgv(args: { name: string; kind: string; paneId: string; agentArgs: readonly string[]; timeoutMs?: number }): string[] {
  const base = ["agent", "start", args.name, "--kind", args.kind, "--pane", args.paneId, ...(args.timeoutMs == null ? [] : ["--timeout", String(args.timeoutMs)])];
  return args.agentArgs.length > 0 ? [...base, "--", ...args.agentArgs] : base;
}

function agentPromptArgv(args: { target: string; text: string; wait: boolean; until?: readonly HerdrAgentStatus[]; timeoutMs?: number }): string[] {
  const untilFlags = (args.until ?? []).flatMap((status) => ["--until", status]);
  return [
    "agent", "prompt", args.target, args.text,
    ...(args.wait ? ["--wait"] : []),
    ...untilFlags,
    ...(args.timeoutMs == null ? [] : ["--timeout", String(args.timeoutMs)]),
  ];
}

type AgentMethods = Pick<HerdrCli, "agentList" | "agentGet" | "agentStart" | "agentPrompt" | "agentRename" | "agentFocus" | "agentRead">;
type WorkspaceMethods = Pick<HerdrCli, "workspaceList" | "workspaceCreate" | "tabCreate" | "paneClose" | "notify">;

function createAgentMethods(runner: RawHerdrRunner): AgentMethods {
  return {
    async agentList() {
      const result = await runJson(runner, ["agent", "list"], { timeoutMs: 10_000 });
      return Array.isArray(result.agents) ? result.agents.flatMap((value) => { const agent = projectHerdrAgentInfo(value); return agent == null ? [] : [agent]; }) : [];
    },
    async agentGet(target) {
      return requireAgent(await runJson(runner, ["agent", "get", target]), "agent get");
    },
    async agentStart(args) {
      return requireAgent(await runJson(runner, agentStartArgv(args)), "agent start");
    },
    async agentPrompt(args) {
      const result = await runJson(runner, agentPromptArgv(args));
      return projectHerdrAgentInfo(result.agent);
    },
    async agentRename(target, name) {
      await runJson(runner, name == null ? ["agent", "rename", target, "--clear"] : ["agent", "rename", target, name]);
    },
    async agentFocus(target) {
      await runJson(runner, ["agent", "focus", target]);
    },
    async agentRead(target, lines) {
      const { stdout, stderr, code } = await runner(["agent", "read", target, "--source", "visible", "--lines", String(lines)]);
      if (code !== 0) throw errorFromStderr(stderr, "agent read failed");
      return stdout;
    },
  };
}

function createWorkspaceMethods(runner: RawHerdrRunner): WorkspaceMethods {
  return {
    async workspaceList() {
      const result = await runJson(runner, ["workspace", "list"]);
      return Array.isArray(result.workspaces)
        ? result.workspaces.flatMap((value) => (isRecord(value) && typeof value.workspace_id === "string" ? [{ workspace_id: value.workspace_id, label: typeof value.label === "string" ? value.label : "" }] : []))
        : [];
    },
    async workspaceCreate(args) {
      const result = await runJson(runner, ["workspace", "create", "--cwd", args.cwd, "--label", args.label, "--no-focus"]);
      const workspace = isRecord(result.workspace) ? result.workspace : {};
      const rootPane = isRecord(result.root_pane) ? result.root_pane : {};
      return { workspaceId: requireString(workspace.workspace_id, "workspace create: workspace_id"), rootPaneId: requireString(rootPane.pane_id, "workspace create: root_pane.pane_id") };
    },
    async tabCreate(args) {
      const result = await runJson(runner, ["tab", "create", "--workspace", args.workspaceId, "--cwd", args.cwd, "--label", args.label, "--no-focus"]);
      const tab = isRecord(result.tab) ? result.tab : {};
      const rootPane = isRecord(result.root_pane) ? result.root_pane : {};
      return { tabId: requireString(tab.tab_id, "tab create: tab_id"), rootPaneId: requireString(rootPane.pane_id, "tab create: root_pane.pane_id") };
    },
    async paneClose(paneId) {
      await runJson(runner, ["pane", "close", paneId]);
    },
    async notify(title, body) {
      await runJson(runner, ["notification", "show", title, "--body", body]);
    },
  };
}

/** Every call targets one named herdr session via the global `--session` flag; `null` inherits herdr's own default. */
export function withSession(runner: RawHerdrRunner, session: string | null): RawHerdrRunner {
  if (session == null || session.length === 0) return runner;
  return (args, options) => runner(["--session", session, ...args], options);
}

export function createHerdrCliFromRunner(runner: RawHerdrRunner): HerdrCli {
  return { sessionList: () => runSessionList(runner), ...createAgentMethods(runner), ...createWorkspaceMethods(runner) };
}

export function createHerdrCli(binPath: string, env: NodeJS.ProcessEnv = process.env, session: string | null = null): HerdrCli {
  return createHerdrCliFromRunner(withSession(createExecFileRunner(binPath, env), session));
}
