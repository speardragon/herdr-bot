/**
 * Per-chat composer draft persistence. The host has no draft concept at all, and herdr-bot's own
 * desktop bridge doesn't expose a generic key/value store either, so this is plain `localStorage`
 * under a UI-owned key, with an in-memory layer in front so reads/writes work identically in the
 * browser dev harness and are synchronous for the composer (no flash of an empty field while
 * `localStorage` round-trips -- it doesn't round-trip, but keeping the shapes separate makes that an
 * implementation detail, not a contract).
 *
 * Pure storage abstraction (`DraftStorage`) so the logic is testable without a real `localStorage`.
 */

const STORAGE_KEY_PREFIX = "herdr-bot.draft.";

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory `DraftStorage` -- used by tests and as the fallback when `localStorage` throws (private
 * browsing, blocked site data, ...). */
export function createMemoryDraftStorage(): DraftStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export interface DraftStore {
  get(chatId: string): string;
  set(chatId: string, text: string): void;
  clear(chatId: string): void;
}

export function createDraftStore(storage: DraftStorage): DraftStore {
  const key = (chatId: string): string => `${STORAGE_KEY_PREFIX}${chatId}`;
  return {
    get(chatId) {
      try {
        return storage.getItem(key(chatId)) ?? "";
      } catch {
        return "";
      }
    },
    set(chatId, text) {
      try {
        if (text.length === 0) storage.removeItem(key(chatId));
        else storage.setItem(key(chatId), text);
      } catch {
        // best-effort persistence only -- a full disk/blocked storage must not crash the composer.
      }
    },
    clear(chatId) {
      try {
        storage.removeItem(key(chatId));
      } catch {
        // see set()
      }
    },
  };
}

/** Picks `window.localStorage` when it's actually usable (throws in some private-browsing modes just on
 * access), otherwise an in-memory store -- so the composer always has *some* working draft store. */
export function createBrowserDraftStorage(): DraftStorage {
  try {
    const probeKey = `${STORAGE_KEY_PREFIX}__probe__`;
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return createMemoryDraftStorage();
  }
}
