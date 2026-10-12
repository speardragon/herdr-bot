import { join } from "node:path";
import type { PermissionMode } from "./profile-store.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";
import { isTerminal, type TerminalChoice } from "../terminal/open-terminal.ts";

/**
 * App-wide defaults used by both the quick-create ("+") path and the advanced
 * New Bot dialog -- a default working folder (so neither path silently spawns an agent in the user's
 * home directory), a default AI provider, and a default permission mode. All three
 * are optional: `null` means "no explicit override", and callers (RosterService) fall back further
 * (env override, then the most recently used bot's cwd, then nothing).
 */
export interface AppSettings {
  readonly defaultWorkingFolder: string | null;
  readonly defaultProvider: string | null;
  readonly defaultPermissionMode: PermissionMode | null;
  /** The terminal "Open in herdr" uses; `null` picks a running one. */
  readonly terminal: TerminalChoice;
}

const EMPTY_SETTINGS: AppSettings = { defaultWorkingFolder: null, defaultProvider: null, defaultPermissionMode: null, terminal: null };

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function permissionModeOrNull(value: unknown): PermissionMode | null {
  return value === "ask" || value === "auto" ? value : null;
}

function projectAppSettings(value: unknown): AppSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return {
    defaultWorkingFolder: stringOrNull(record.defaultWorkingFolder),
    defaultProvider: stringOrNull(record.defaultProvider),
    defaultPermissionMode: permissionModeOrNull(record.defaultPermissionMode),
    terminal: isTerminal(record.terminal) ? record.terminal : null,
  };
}

export class AppSettingsStore {
  readonly #path: string;

  constructor(home: string) {
    this.#path = join(home, "state", "app-settings.json");
  }

  get(): AppSettings {
    return readJsonFile(this.#path, projectAppSettings) ?? EMPTY_SETTINGS;
  }

  /** Merges `patch` onto the current settings and persists the result; an explicit `null` in `patch`
   * clears that field back to "no override" (distinguished from an absent key, which leaves it alone). */
  update(patch: Partial<AppSettings>): AppSettings {
    const next: AppSettings = { ...this.get(), ...patch };
    writeJsonFileAtomic(this.#path, next);
    return next;
  }
}
