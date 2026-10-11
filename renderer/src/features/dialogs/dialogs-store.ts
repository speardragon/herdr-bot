/**
 * A tiny module-singleton store (reusing `data/store/create-store.ts`'s `useSyncExternalStore`-friendly
 * container -- no new state-management primitive) for the two pieces of dialogs state that need to be
 * reachable from *outside* the main column's React subtree: the quick-create "New" menu (it replaces
 * the main column in-place, not a modal) and the info panel (`PanelHost` only wraps the main
 * column -- see `shell/AppShell.tsx` -- so a sidebar row's "Edit Profile"/header click can't call
 * `useInfoPanel()` directly without crashing outside that subtree).
 *
 * `DialogsPanelSync` (mounted once inside `PanelHost`, see `useMainColumnOverride.ts`) is the only thing
 * that reads `panelRequest` and turns it into a real `useInfoPanel().open(...)` call -- every other call
 * site just writes to this store via `useDialogs()`'s `openBotInfo`/`openRoomInfo`.
 */
import { createStore } from "../../data/store/create-store.ts";

export interface PanelRequest {
  readonly kind: "bot" | "room";
  readonly chatId: string;
  /** Bumped on every request so re-opening the same chat's panel (e.g. a second click) still re-syncs
   * even though `kind`/`chatId` didn't change. */
  readonly nonce: number;
}

export interface DialogsState {
  readonly newMenuOpen: boolean;
  readonly panelRequest: PanelRequest | null;
}

let nonce = 0;

export const dialogsStore = createStore<DialogsState>({ newMenuOpen: false, panelRequest: null });

export function openNewMenu(): void {
  dialogsStore.setState({ ...dialogsStore.getState(), newMenuOpen: true });
}

export function closeNewMenu(): void {
  const state = dialogsStore.getState();
  if (!state.newMenuOpen) return;
  dialogsStore.setState({ ...state, newMenuOpen: false });
}

export function requestPanel(kind: "bot" | "room", chatId: string): void {
  nonce += 1;
  dialogsStore.setState({ ...dialogsStore.getState(), panelRequest: { kind, chatId, nonce } });
}

export function clearPanelRequest(): void {
  dialogsStore.setState({ ...dialogsStore.getState(), panelRequest: null });
}
