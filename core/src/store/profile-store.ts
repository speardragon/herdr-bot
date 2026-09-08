import { readdirSync, rmSync } from "node:fs";
import { hostPaths } from "../config.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";

export type PermissionMode = "ask" | "auto";

export interface BotHerdrRef {
  readonly paneId: string | null;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
}

export interface BotProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly cwd: string;
  readonly permissionMode: PermissionMode;
  readonly avatarShape: string | null;
  readonly avatarColor: string | null;
  readonly adopted: boolean;
  readonly herdr: BotHerdrRef;
  readonly notifyOnUpdatesEnabled: boolean;
  readonly isHiddenFromSidebar: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function projectHerdrRef(value: unknown): BotHerdrRef {
  const record = isRecord(value) ? value : {};
  return { paneId: stringOrNull(record.paneId), workspaceId: stringOrNull(record.workspaceId), sessionId: stringOrNull(record.sessionId) };
}

export function projectBotProfile(value: unknown): BotProfile | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.kind !== "string" || typeof value.cwd !== "string") return null;
  if (value.permissionMode !== "ask" && value.permissionMode !== "auto") return null;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    kind: value.kind,
    cwd: value.cwd,
    permissionMode: value.permissionMode,
    avatarShape: stringOrNull(value.avatarShape),
    avatarColor: stringOrNull(value.avatarColor),
    adopted: value.adopted === true,
    herdr: projectHerdrRef(value.herdr),
    notifyOnUpdatesEnabled: value.notifyOnUpdatesEnabled !== false,
    isHiddenFromSidebar: value.isHiddenFromSidebar === true,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function listDirectories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export class ProfileStore {
  readonly home: string;

  constructor(home: string) {
    this.home = home;
  }

  list(): BotProfile[] {
    return listDirectories(hostPaths.bots(this.home)).flatMap((id) => {
      const profile = this.get(id);
      return profile == null ? [] : [profile];
    });
  }

  get(id: string): BotProfile | null {
    return readJsonFile(hostPaths.botProfile(this.home, id), projectBotProfile);
  }

  save(profile: BotProfile): void {
    writeJsonFileAtomic(hostPaths.botProfile(this.home, profile.id), profile);
  }

  delete(id: string): void {
    rmSync(hostPaths.bot(this.home, id), { recursive: true, force: true });
  }
}
