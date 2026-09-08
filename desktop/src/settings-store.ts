import { readJsonFile, writeJsonFileAtomic } from "../../core/src/store/json-file.ts";

type SettingsMap = Readonly<Record<string, unknown>>;

function projectMap(value: unknown): SettingsMap | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as SettingsMap) : null;
}

export class SettingsStore {
  readonly path: string;
  #map: SettingsMap | null = null;

  constructor(path: string) {
    this.path = path;
  }

  get<T>(key: string, fallback: T): T {
    const value = this.#load()[key];
    return value === undefined ? fallback : (value as T);
  }

  set(key: string, value: unknown): void {
    this.#save({ ...this.#load(), [key]: value });
  }

  remove(key: string): void {
    const { [key]: _removed, ...rest } = this.#load();
    this.#save(rest);
  }

  keys(prefix: string): string[] {
    return Object.keys(this.#load()).filter((key) => key.startsWith(prefix));
  }

  #load(): SettingsMap {
    if (this.#map == null) this.#map = readJsonFile(this.path, projectMap) ?? {};
    return this.#map;
  }

  #save(map: SettingsMap): void {
    this.#map = map;
    writeJsonFileAtomic(this.path, map);
  }
}
