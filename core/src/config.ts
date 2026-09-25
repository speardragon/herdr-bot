import { homedir, userInfo } from "node:os";
import { join } from "node:path";

export const DEFAULT_TURN_TIMEOUT_MS = 180_000;
export const DEFAULT_BRIEF_TIMEOUT_MS = 60_000;
export const DEFAULT_BOT_KIND = "claude";
/** Bots live in their own named herdr session so they never crowd the user's main (`default`) session. */
export const DEFAULT_HERDR_SESSION = "herdr-bot";

export interface HostConfig {
  readonly home: string;
  readonly herdrBin: string;
  /** Named herdr session every herdr call targets (`herdr --session <name> …`); `default` is the main session. */
  readonly herdrSession: string;
  readonly herdrSocketPath: string;
  readonly controlSocketPath: string;
  readonly cliPath: string;
  readonly userName: string;
  readonly turnTimeoutMs: number;
  readonly briefTimeoutMs: number;
  readonly defaultKind: string;
  readonly defaultCwd: string;
}

function nonEmpty(value: string | undefined): string | null {
  return value != null && value.length > 0 ? value : null;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = value == null ? Number.NaN : Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultUserName(): string {
  try {
    return userInfo().username;
  } catch {
    return "user";
  }
}

/** Where herdr keeps a session's API socket: the main session at the config root, named ones under `sessions/<name>/`. */
export function herdrSessionSocketPath(session: string): string {
  const root = join(homedir(), ".config", "herdr");
  return session === "default" ? join(root, "herdr.sock") : join(root, "sessions", session, "herdr.sock");
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): HostConfig {
  const home = nonEmpty(env.HERDR_BOT_HOME) ?? join(homedir(), ".herdr-bot");
  const herdrSession = nonEmpty(env.HERDR_BOT_SESSION) ?? DEFAULT_HERDR_SESSION;
  return {
    home,
    herdrBin: nonEmpty(env.HERDR_BIN_PATH) ?? "herdr",
    herdrSession,
    // Deliberately NOT `HERDR_SOCKET_PATH`: herdr injects that into every pane it manages, pointing at
    // the session the *terminal* lives in (usually `default`). An app launched from such a terminal
    // would then subscribe to a session that has none of the bots' panes -- every per-pane
    // subscription refused with pane_not_found, retried forever, and no live status events at all.
    herdrSocketPath: nonEmpty(env.HERDR_BOT_SOCKET_PATH) ?? herdrSessionSocketPath(herdrSession),
    controlSocketPath: join(home, "host.sock"),
    cliPath: join(home, "bin", "herdr-bot"),
    userName: nonEmpty(env.HERDR_BOT_USER_NAME) ?? defaultUserName(),
    turnTimeoutMs: positiveInt(env.HERDR_BOT_TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS),
    briefTimeoutMs: positiveInt(env.HERDR_BOT_BRIEF_TIMEOUT_MS, DEFAULT_BRIEF_TIMEOUT_MS),
    defaultKind: nonEmpty(env.HERDR_BOT_DEFAULT_KIND) ?? DEFAULT_BOT_KIND,
    defaultCwd: nonEmpty(env.HERDR_BOT_DEFAULT_CWD) ?? homedir(),
  };
}

export const hostPaths = {
  bots: (home: string): string => join(home, "bots"),
  bot: (home: string, id: string): string => join(home, "bots", id),
  botProfile: (home: string, id: string): string => join(home, "bots", id, "profile.json"),
  botTranscript: (home: string, id: string): string => join(home, "bots", id, "transcript.jsonl"),
  rooms: (home: string): string => join(home, "rooms"),
  room: (home: string, id: string): string => join(home, "rooms", id),
  roomConfig: (home: string, id: string): string => join(home, "rooms", id, "room.json"),
  roomTranscript: (home: string, id: string): string => join(home, "rooms", id, "transcript.jsonl"),
  state: (home: string): string => join(home, "state"),
  viewState: (home: string): string => join(home, "state", "view-state.json"),
  workspaces: (home: string): string => join(home, "state", "workspaces.json"),
  bin: (home: string): string => join(home, "bin"),
} as const;
