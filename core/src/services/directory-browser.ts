import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";

export interface DirectoryListing {
  /** Whether the raw input, after `~` expansion, is itself an existing directory. */
  readonly exists: boolean;
  /** Absolute paths of sibling/child directories matching the input's last segment, for autocomplete. */
  readonly entries: readonly string[];
}

const MAX_ENTRIES = 50;

function expandHome(raw: string): string {
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  return raw;
}

function isDirectory(path: string): boolean {
  try {
    return readdirSync(path) != null;
  } catch {
    return false;
  }
}

function subdirectories(parent: string, prefix: string): string[] {
  let entries;
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  const showDotfiles = prefix.startsWith(".");
  return entries
    .filter((entry) => entry.isDirectory() && (showDotfiles || !entry.name.startsWith(".")) && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_ENTRIES)
    .map((name) => join(parent, name));
}

/**
 * Resolves a working-directory input (as typed in the New Bot dialog) into whether it already
 * names a directory, plus a list of matching subdirectories for autocomplete. `raw` may be
 * partial (a trailing incomplete segment) or empty (lists the home directory).
 */
export function listDirectories(raw: string): DirectoryListing {
  const trimmed = raw.trim();
  const expanded = trimmed.length === 0 ? homedir() : expandHome(trimmed);
  const path = isAbsolute(expanded) ? expanded : join(homedir(), expanded);
  const exists = isDirectory(path);
  if (trimmed.length === 0 || trimmed.endsWith("/")) return { exists, entries: subdirectories(path, "") };
  return { exists, entries: subdirectories(dirname(path), basename(path)) };
}
