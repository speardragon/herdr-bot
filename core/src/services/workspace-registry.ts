import { hostPaths } from "../config.ts";
import { readJsonFile, writeJsonFileAtomic } from "../store/json-file.ts";

interface WorkspaceMap {
  readonly byCwd: Readonly<Record<string, string>>;
}

function projectMap(value: unknown): WorkspaceMap | null {
  if (typeof value !== "object" || value === null) return null;
  const byCwd = (value as { byCwd?: unknown }).byCwd;
  if (typeof byCwd !== "object" || byCwd === null) return { byCwd: {} };
  const result: Record<string, string> = {};
  for (const [cwd, id] of Object.entries(byCwd as Record<string, unknown>)) if (typeof id === "string") result[cwd] = id;
  return { byCwd: result };
}

export class WorkspaceRegistry {
  readonly path: string;

  constructor(home: string) {
    this.path = hostPaths.workspaces(home);
  }

  get(cwd: string): string | null {
    return (readJsonFile(this.path, projectMap) ?? { byCwd: {} }).byCwd[cwd] ?? null;
  }

  set(cwd: string, workspaceId: string): void {
    const current = readJsonFile(this.path, projectMap) ?? { byCwd: {} };
    writeJsonFileAtomic(this.path, { byCwd: { ...current.byCwd, [cwd]: workspaceId } });
  }
}
