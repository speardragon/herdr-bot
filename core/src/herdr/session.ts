import { spawn } from "node:child_process";
import type { HerdrSessionInfo } from "./cli.ts";
import { HerdrError } from "./types.ts";

export const DEFAULT_SESSION_TIMEOUT_MS = 10_000;
export const DEFAULT_SESSION_POLL_MS = 250;

export interface EnsureHerdrSessionDeps {
  readonly session: string;
  readonly sessionList: () => Promise<readonly HerdrSessionInfo[]>;
  /** Starts the session's headless server; the poll below decides whether it worked. */
  readonly spawnServer: () => void;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}

/**
 * Starts `herdr --session <name> server` detached: a herdr session is meant to outlive the
 * process that created it (panes and agents keep running), exactly like the main session.
 */
export function spawnHerdrSessionServer(binPath: string, session: string, env: NodeJS.ProcessEnv = process.env): void {
  const child = spawn(binPath, ["--session", session, "server"], { detached: true, stdio: "ignore", env });
  child.on("error", () => {
    // A missing binary surfaces through the readiness poll timing out; nothing to do here.
  });
  child.unref();
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves the session's API socket path once herdr reports the session as running, starting it if needed. */
export async function ensureHerdrSession(deps: EnsureHerdrSessionDeps): Promise<string> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
  const pollMs = deps.pollMs ?? DEFAULT_SESSION_POLL_MS;
  const find = async (): Promise<HerdrSessionInfo | null> => (await deps.sessionList()).find((info) => info.name === deps.session) ?? null;

  const existing = await find();
  if (existing?.running) return existing.socketPath;
  deps.spawnServer();
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(pollMs);
    const current = await find();
    if (current?.running) return current.socketPath;
  }
  throw new HerdrError("herdr_session_unavailable", `herdr session "${deps.session}" did not start within ${timeoutMs}ms`);
}
