import { execFile, spawn } from "node:child_process";
import { providerLaunchCapabilities } from "./launch-args.ts";
import { userFallbackModels } from "./model-fallbacks.ts";

export interface ModelEntry {
  readonly id: string;
  readonly label: string;
}

/** Where a `ModelCatalogResult`'s entries came from, for the New Bot dialog to explain to the user. */
export type ModelCatalogSource = "installed-cli" | "latest-alias" | "user-fallback" | "unavailable";

export interface ModelCatalogResult {
  readonly models: readonly ModelEntry[];
  readonly source: ModelCatalogSource;
  readonly error?: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_BUFFER = 4 * 1024 * 1024;

// Claude Code and Gemini CLI have no confirmed non-interactive command that lists installed/logged-in
// models (see task-6-brief.md); their `--model` flag instead accepts these aliases, which the CLI
// itself resolves to its current latest build. If a real list command is ever confirmed for either,
// it should be queried in `queryProvider` below in preference to this hardcoded table.
const CLAUDE_ALIASES: readonly ModelEntry[] = [
  { id: "opus", label: "opus" },
  { id: "sonnet", label: "sonnet" },
  { id: "haiku", label: "haiku" },
];

const GEMINI_ALIASES: readonly ModelEntry[] = [
  { id: "auto", label: "auto" },
  { id: "pro", label: "pro" },
  { id: "flash", label: "flash" },
  { id: "flash-lite", label: "flash-lite" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** First-occurrence-wins dedup, preserving the order entries were discovered in. */
function dedupById(entries: readonly ModelEntry[]): ModelEntry[] {
  const seen = new Set<string>();
  const out: ModelEntry[] = [];
  for (const entry of entries) {
    if (entry.id.length === 0 || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

/**
 * `grok models` prints a human-readable summary, e.g.:
 *   Available models:
 *     * grok-4.7 (default)
 *     - grok-4.7-build-fast
 * The model list is the `* id` / `- id` bullet lines; everything else (login banner, "Default
 * model:" line) is ignored.
 */
export function parseGrokModelsOutput(stdout: string): ModelEntry[] {
  const entries: ModelEntry[] = [];
  for (const rawLine of stdout.split("\n")) {
    const match = /^\s*[*-]\s+(\S+)/.exec(rawLine);
    const id = match?.[1];
    if (id != null) entries.push({ id, label: id });
  }
  return dedupById(entries);
}

/** `opencode models` prints one `provider/model` id per line, with no header or extra formatting. */
export function parseOpencodeModelsOutput(stdout: string): ModelEntry[] {
  const entries = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((id) => ({ id, label: id }));
  return dedupById(entries);
}

/**
 * Projects Codex app-server's `model/list` result entries (the `Model` shape from the app-server
 * protocol schema: `{ id, model, displayName, hidden, ... }`) to the catalog's plain `{id, label}`.
 * `hidden` models are not filtered here -- the request already omits `includeHidden`, so the server
 * itself excludes them from the default response.
 */
export function projectCodexModels(data: readonly unknown[]): ModelEntry[] {
  const entries: ModelEntry[] = [];
  for (const value of data) {
    if (!isRecord(value)) continue;
    const id = typeof value.id === "string" ? value.id : typeof value.model === "string" ? value.model : null;
    if (id == null) continue;
    const label = typeof value.displayName === "string" && value.displayName.length > 0 ? value.displayName : id;
    entries.push({ id, label });
  }
  return dedupById(entries);
}

export interface ModelCatalogDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly now: () => number;
  readonly timeoutMs: number;
  readonly ttlMs: number;
}

function resolvedDeps(overrides: Partial<ModelCatalogDeps>): ModelCatalogDeps {
  return {
    env: process.env,
    now: Date.now,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    ttlMs: DEFAULT_TTL_MS,
    ...overrides,
  };
}

interface RunOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

function runOneShot(command: string, args: readonly string[], deps: ModelCatalogDeps): Promise<RunOutcome> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { env: deps.env, timeout: deps.timeoutMs, maxBuffer: MAX_BUFFER, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error != null && (error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`${command} is not installed`));
        return;
      }
      if (error != null && (error as { killed?: boolean }).killed === true) {
        reject(new Error(`${command} ${args.join(" ")} timed out`));
        return;
      }
      const code = error == null ? 0 : typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : 1;
      resolve({ stdout, stderr, code });
    });
  });
}

function rpcErrorMessage(parsed: Record<string, unknown>, fallback: string): string {
  const error = parsed.error;
  return isRecord(error) && typeof error.message === "string" ? error.message : fallback;
}

/**
 * Codex exposes its model catalog over app-server's newline-delimited JSON-RPC on stdio: an
 * `initialize` handshake is required before any other call, then `model/list` returns `{data: Model[]}`.
 * The server interleaves unrelated notifications (no `id`, e.g. `remoteControl/status/changed`) on the
 * same stream; those are skipped while waiting for the reply matching the request just sent.
 */
const CODEX_CLIENT_INFO = { name: "herdr-bot", version: "0.1.0" };

function runCodexModelList(command: string, deps: ModelCatalogDeps): Promise<ModelEntry[]> {
  return new Promise((resolve, reject) => {
    // stderr is ignored, not piped: an unread pipe fills its OS buffer once the child logs enough,
    // which blocks the child until *we* time it out -- turning a log-noisy build into a guaranteed
    // 5s stall instead of a fast reply.
    const child = spawn(command, ["app-server"], { env: deps.env, stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    let settled = false;
    let awaiting: 1 | 2 = 1;

    function finish(action: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.removeAllListeners("data");
      child.removeAllListeners("error");
      child.removeAllListeners("exit");
      child.stdin.on("error", () => {
        // A write can race a just-exited process (ENOENT/EPIPE); the exit/error listeners above
        // already report that failure, so a stray stdin error here must not crash the process.
      });
      try {
        child.kill();
      } catch {
        // already exited
      }
      action();
    }

    const timer = setTimeout(() => finish(() => reject(new Error(`${command} app-server timed out`))), deps.timeoutMs);

    // An old/mismatched `codex` binary without an `app-server` subcommand prints usage and exits
    // immediately, rather than replying with a JSON-RPC error: fail fast instead of idling out the
    // full timeout waiting for a reply that will never come.
    child.on("exit", (code) => finish(() => reject(new Error(`${command} app-server exited before replying (code ${code})`))));

    function send(id: 1 | 2, method: string, params: unknown): void {
      awaiting = id;
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    }

    child.on("error", (error) => finish(() => reject(error instanceof Error ? error : new Error(String(error)))));
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (line.length === 0) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (!isRecord(parsed) || parsed.id !== awaiting) continue; // notification or stale reply
        if (awaiting === 1) {
          if (parsed.error != null) {
            finish(() => reject(new Error(rpcErrorMessage(parsed, "initialize failed"))));
            return;
          }
          send(2, "model/list", {});
          continue;
        }
        if (parsed.error != null) {
          finish(() => reject(new Error(rpcErrorMessage(parsed, "model/list failed"))));
          return;
        }
        const data = isRecord(parsed.result) && Array.isArray(parsed.result.data) ? parsed.result.data : [];
        finish(() => resolve(projectCodexModels(data)));
        return;
      }
    });

    send(1, "initialize", { clientInfo: CODEX_CLIENT_INFO });
  });
}

function fallbackOrUnavailable(kind: string, error: string): ModelCatalogResult {
  const fallback = userFallbackModels(kind);
  return fallback.length > 0 ? { models: fallback, source: "user-fallback", error } : { models: [], source: "unavailable", error };
}

async function queryOneShotList(
  kind: string,
  command: string,
  args: readonly string[],
  parse: (stdout: string) => ModelEntry[],
  deps: ModelCatalogDeps,
): Promise<ModelCatalogResult> {
  let outcome: RunOutcome;
  try {
    outcome = await runOneShot(command, args, deps);
  } catch (error) {
    return fallbackOrUnavailable(kind, error instanceof Error ? error.message : String(error));
  }
  if (outcome.code !== 0) return fallbackOrUnavailable(kind, outcome.stderr.trim() || `${command} ${args.join(" ")} exited with ${outcome.code}`);
  const models = parse(outcome.stdout);
  if (models.length === 0) return fallbackOrUnavailable(kind, `${command} ${args.join(" ")} returned no models`);
  return { models, source: "installed-cli" };
}

async function queryCodex(deps: ModelCatalogDeps): Promise<ModelCatalogResult> {
  let models: ModelEntry[];
  try {
    models = await runCodexModelList("codex", deps);
  } catch (error) {
    return fallbackOrUnavailable("codex", error instanceof Error ? error.message : String(error));
  }
  if (models.length === 0) return fallbackOrUnavailable("codex", "codex app-server returned no models");
  return { models, source: "installed-cli" };
}

function aliasResult(kind: string, aliases: readonly ModelEntry[]): ModelCatalogResult {
  return { models: dedupById([...aliases, ...userFallbackModels(kind)]), source: "latest-alias" };
}

async function queryProvider(kind: string, deps: ModelCatalogDeps): Promise<ModelCatalogResult> {
  switch (kind) {
    case "grok":
      return queryOneShotList("grok", "grok", ["models"], parseGrokModelsOutput, deps);
    case "opencode":
      return queryOneShotList("opencode", "opencode", ["models"], parseOpencodeModelsOutput, deps);
    case "codex":
      return queryCodex(deps);
    case "claude":
      return aliasResult("claude", CLAUDE_ALIASES);
    case "gemini":
      return aliasResult("gemini", GEMINI_ALIASES);
    default:
      return { models: [], source: "unavailable" };
  }
}

interface CacheEntry {
  readonly result: ModelCatalogResult;
  readonly timestamp: number;
  readonly refreshing: boolean;
}

export interface ModelCatalog {
  listBotModels(kind: string): Promise<ModelCatalogResult>;
}

/**
 * Builds a model catalog with its own cache. `listBotModels(kind)` resolves capability-unsupported
 * kinds immediately (no process spawned), and otherwise: on a cold cache, awaits a real query; once
 * cached, returns the cached result immediately and -- once the cache has aged past `ttlMs` -- kicks
 * off a background re-query (deduped against a concurrent one) without making the caller wait, so a
 * dialog reopen shows the last known list right away while it refreshes for next time.
 */
export function createModelCatalog(overrides: Partial<ModelCatalogDeps> = {}): ModelCatalog {
  const deps = resolvedDeps(overrides);
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<ModelCatalogResult>>();

  function fetchAndCache(kind: string): Promise<ModelCatalogResult> {
    const pending = inFlight.get(kind);
    if (pending != null) return pending;
    const promise = queryProvider(kind, deps).then((result) => {
      cache.set(kind, { result, timestamp: deps.now(), refreshing: false });
      inFlight.delete(kind);
      return result;
    });
    inFlight.set(kind, promise);
    return promise;
  }

  async function listBotModels(kind: string): Promise<ModelCatalogResult> {
    if (!providerLaunchCapabilities(kind).model) return { models: [], source: "unavailable" };
    const entry = cache.get(kind);
    if (entry == null) return fetchAndCache(kind);
    if (deps.now() - entry.timestamp >= deps.ttlMs && !entry.refreshing) {
      cache.set(kind, { ...entry, refreshing: true });
      void fetchAndCache(kind).catch(() => {
        const current = cache.get(kind);
        if (current != null && current.refreshing) cache.set(kind, { ...current, refreshing: false });
      });
    }
    return entry.result;
  }

  return { listBotModels };
}

const defaultCatalog = createModelCatalog();

/** Discovers the models available for a bot `kind`, from its installed CLI where one can be queried
 * non-interactively, from a hardcoded latest-version alias table, from a user-configured fallback list,
 * or `source: "unavailable"` when none of those apply. See `core/src/bots/model-fallbacks.ts` and the
 * Task 6 plan brief for the per-provider lookup this follows. */
export function listBotModels(kind: string): Promise<ModelCatalogResult> {
  return defaultCatalog.listBotModels(kind);
}
