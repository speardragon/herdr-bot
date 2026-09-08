import { hostPaths } from "../config.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";

export interface ChatViewState {
  readonly lastViewedAt: number;
  readonly lastActivityAt: number;
  readonly isManuallyUnread: boolean;
}

export const EMPTY_VIEW_STATE: ChatViewState = { lastViewedAt: 0, lastActivityAt: 0, isManuallyUnread: false };

type ViewStateMap = Readonly<Record<string, ChatViewState>>;

function projectMap(value: unknown): ViewStateMap | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result: Record<string, ChatViewState> = {};
  for (const [chatId, state] of Object.entries(value as Record<string, unknown>)) {
    if (typeof state !== "object" || state === null) continue;
    const candidate = state as Record<string, unknown>;
    result[chatId] = {
      lastViewedAt: typeof candidate.lastViewedAt === "number" ? candidate.lastViewedAt : 0,
      lastActivityAt: typeof candidate.lastActivityAt === "number" ? candidate.lastActivityAt : 0,
      isManuallyUnread: candidate.isManuallyUnread === true,
    };
  }
  return result;
}

export class ViewStateStore {
  readonly path: string;
  #map: ViewStateMap | null = null;

  constructor(home: string) {
    this.path = hostPaths.viewState(home);
  }

  get(chatId: string): ChatViewState {
    return this.#load()[chatId] ?? EMPTY_VIEW_STATE;
  }

  markViewed(chatId: string, now: number): ChatViewState {
    return this.#put(chatId, { ...this.get(chatId), lastViewedAt: now, isManuallyUnread: false });
  }

  markActivity(chatId: string, now: number): ChatViewState {
    return this.#put(chatId, { ...this.get(chatId), lastActivityAt: now });
  }

  setManuallyUnread(chatId: string, isUnread: boolean): ChatViewState {
    return this.#put(chatId, { ...this.get(chatId), isManuallyUnread: isUnread });
  }

  delete(chatId: string): void {
    const { [chatId]: _removed, ...rest } = this.#load();
    this.#save(rest);
  }

  #put(chatId: string, state: ChatViewState): ChatViewState {
    this.#save({ ...this.#load(), [chatId]: state });
    return state;
  }

  #load(): ViewStateMap {
    if (this.#map == null) this.#map = readJsonFile(this.path, projectMap) ?? {};
    return this.#map;
  }

  #save(map: ViewStateMap): void {
    this.#map = map;
    writeJsonFileAtomic(this.path, map);
  }
}
