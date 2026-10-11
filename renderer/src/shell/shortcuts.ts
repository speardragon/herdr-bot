/**
 * Global keyboard shortcut registry. Pure/DOM-free: it is handed a plain description of a keydown
 * (see `KeyEventLike`) and a combo string, not a real `KeyboardEvent` -- the one DOM listener lives in
 * `ShortcutsProvider`, which adapts real events into this shape and is the only part that isn't
 * independently unit-testable.
 *
 * Extension point: any feature slice calls `registry.register(id, combo, handler)` (via
 * `useShortcut` in ShortcutsProvider.tsx) to add its own shortcut without editing shell code. Combos
 * use a platform-neutral `"mod"` for the primary modifier (⌘ on macOS, Ctrl elsewhere).
 */

export interface KeyEventLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export interface ParsedCombo {
  readonly key: string;
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

/** Parses a combo string like `"mod+k"`, `"mod+shift+n"`, `"escape"`. Case-insensitive; key names other
 * than single characters (escape, enter, ...) are compared lowercase against `event.key`. */
export function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  let mod = false;
  let shift = false;
  let alt = false;
  let key = "";
  for (const part of parts) {
    if (part === "mod") mod = true;
    else if (part === "shift") shift = true;
    else if (part === "alt" || part === "option") alt = true;
    else key = part;
  }
  return { key, mod, shift, alt };
}

export function matchesCombo(event: KeyEventLike, combo: string, platform: NodeJS.Platform | "darwin" | "other"): boolean {
  const parsed = parseCombo(combo);
  const modPressed = platform === "darwin" ? event.metaKey : event.ctrlKey;
  if (parsed.mod !== modPressed) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  return event.key.toLowerCase() === parsed.key;
}

export interface ShortcutEntry {
  readonly id: string;
  readonly combo: string;
  readonly handler: (event: KeyEventLike) => void;
}

export interface ShortcutRegistry {
  register(id: string, combo: string, handler: (event: KeyEventLike) => void): () => void;
  /** Returns true if some registered shortcut matched and ran (so the caller can `preventDefault`). */
  dispatch(event: KeyEventLike, platform: NodeJS.Platform | "darwin" | "other"): boolean;
  list(): readonly ShortcutEntry[];
}

export function createShortcutRegistry(): ShortcutRegistry {
  const entries = new Map<string, ShortcutEntry>();

  return {
    register(id, combo, handler) {
      entries.set(id, { id, combo, handler });
      return () => {
        if (entries.get(id)?.handler === handler) entries.delete(id);
      };
    },
    dispatch(event, platform) {
      for (const entry of entries.values()) {
        if (matchesCombo(event, entry.combo, platform)) {
          entry.handler(event);
          return true;
        }
      }
      return false;
    },
    list() {
      return [...entries.values()];
    },
  };
}
