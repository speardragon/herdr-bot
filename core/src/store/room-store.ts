import { readdirSync, rmSync } from "node:fs";
import { hostPaths } from "../config.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";

export interface RoomConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly memberIds: readonly string[];
  readonly isHiddenFromSidebar: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function dedupeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) seen.add(item);
  }
  return [...seen];
}

export function projectRoomConfig(value: unknown): RoomConfig | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    memberIds: dedupeIds(value.memberIds),
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

export class RoomStore {
  readonly home: string;

  constructor(home: string) {
    this.home = home;
  }

  list(): RoomConfig[] {
    return listDirectories(hostPaths.rooms(this.home)).flatMap((id) => {
      const room = this.get(id);
      return room == null ? [] : [room];
    });
  }

  get(id: string): RoomConfig | null {
    return readJsonFile(hostPaths.roomConfig(this.home, id), projectRoomConfig);
  }

  save(room: RoomConfig): void {
    writeJsonFileAtomic(hostPaths.roomConfig(this.home, room.id), room);
  }

  delete(id: string): void {
    rmSync(hostPaths.room(this.home, id), { recursive: true, force: true });
  }
}
