/**
 * Lets `features/sidebar` open the command palette -- the sidebar's Search button opens the
 * full command palette already focused on typing -- without `PaletteSlot`'s open/closed state living
 * anywhere both folders can reach. `PaletteSlot` owns the state (a plain `useState`, see its file) --
 * this is just the request channel into it: a module-level pub/sub, same shape as `data/jump-target.ts`.
 * Kept here (not in `shell/*`) because only these two owned folders need it.
 */

export interface PaletteOpenRequest {
  readonly initialQuery: string;
}

type Listener = (request: PaletteOpenRequest) => void;

const listeners = new Set<Listener>();

/** Called by the sidebar's Search button / row. `initialQuery` lets a future "search within this
 * chat" entry point pre-fill the palette; the plain Search button passes "". */
export function requestPaletteOpen(initialQuery = ""): void {
  for (const listener of listeners) listener({ initialQuery });
}

export function onPaletteOpenRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
