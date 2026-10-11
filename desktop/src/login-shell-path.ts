import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

// A Finder-launched app inherits macOS's minimal default PATH
// (/usr/bin:/bin:/usr/sbin:/sbin) -- none of Homebrew, nvm/asdf, or a user's ~/.local/bin is on it, so
// `herdr` (usually /opt/homebrew/bin/herdr) and the agent CLIs it shells out to (claude/codex/grok/...)
// are invisible. The fix is to ask the user's actual login shell what its PATH is (that is the PATH a
// Terminal window gets, rc files and all) and merge that in once at startup.

function splitPath(path: string): string[] {
  return path.split(":").filter((entry) => entry.length > 0);
}

/**
 * Prepends `extra` (deduped, first occurrence wins) ahead of `currentPath`'s entries. `extra` is the
 * login shell's PATH when the probe succeeded, or the fallback dirs when it didn't.
 *
 * Prepending (rather than appending) is deliberate: Finder's minimal PATH is a bare default, not a
 * preference, so the login shell's resolution order -- which `node`/`git`/`herdr` a Terminal session
 * would actually use -- should take precedence, exactly as it does when the user runs the app's CLI
 * themselves. Appending would leave e.g. `/usr/bin` ahead of `/opt/homebrew/bin`, so a stray same-named
 * binary under the minimal default could still shadow the user's real tool.
 */
export function mergePath(currentPath: string, loginPath: string | null, fallbackDirs: readonly string[]): string {
  const current = splitPath(currentPath);
  const extra = loginPath != null ? splitPath(loginPath) : [...fallbackDirs];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...extra, ...current]) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    merged.push(entry);
  }
  return merged.join(":");
}

/** Common install locations the minimal Finder PATH misses, used only when the login shell probe fails. */
export function defaultFallbackDirs(home: string): readonly string[] {
  return ["/opt/homebrew/bin", "/usr/local/bin", join(home, ".local/bin")];
}

export const FALLBACK_PATH_DIRS: readonly string[] = defaultFallbackDirs(homedir());

/**
 * `-ilc` makes the shell source the user's rc files (interactive) and profile (login) before running
 * our command, so it prints whatever those files do to stdout first -- banners, neofetch, etc. Markers
 * around the PATH line let the caller discard all of that noise and keep only the text between them.
 * `/usr/bin/printenv` (an absolute path, always present on macOS) is used instead of shell-syntax `$PATH`
 * interpolation because not every shell expands it the same way (fish joins list variables with spaces,
 * not colons); `printenv` always prints the real, colon-separated exported value.
 */
export function buildLoginShellProbeCommand(marker: string): string {
  return `printf '%s' '${marker}'; /usr/bin/printenv PATH; printf '%s' '${marker}'`;
}

/** Returns the text strictly between the first two occurrences of `marker`, or null if that is missing or blank. */
export function extractMarkedPath(output: string, marker: string): string | null {
  const start = output.indexOf(marker);
  if (start === -1) return null;
  const afterStart = start + marker.length;
  const end = output.indexOf(marker, afterStart);
  if (end === -1) return null;
  const value = output.slice(afterStart, end).trim();
  return value.length > 0 ? value : null;
}

/** Runs `shellPath -ilc <command>` and resolves its stdout; rejects on spawn error, timeout, or non-zero exit. */
export type LoginShellRunner = (shellPath: string, command: string, timeoutMs: number) => Promise<string>;

const defaultRunner: LoginShellRunner = (shellPath, command, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(shellPath, ["-ilc", command], { timeout: timeoutMs, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });

const DEFAULT_PROBE_TIMEOUT_MS = 3_000;

/**
 * Resolves the user's login shell's PATH, or null on any failure (missing $SHELL, spawn error, the ~3s
 * timeout, a non-zero exit). Every failure is swallowed here -- the caller always has `mergePath`'s
 * fallback dirs to fall back on, and a broken rc file must never block the app from starting.
 */
export async function resolveLoginShellPath(
  env: NodeJS.ProcessEnv = process.env,
  run: LoginShellRunner = defaultRunner,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<string | null> {
  const shell = env.SHELL != null && env.SHELL.length > 0 ? env.SHELL : "/bin/zsh";
  const marker = `__HERDR_BOT_PATH_${randomBytes(8).toString("hex")}__`;
  try {
    const output = await run(shell, buildLoginShellProbeCommand(marker), timeoutMs);
    return extractMarkedPath(output, marker);
  } catch {
    return null;
  }
}
