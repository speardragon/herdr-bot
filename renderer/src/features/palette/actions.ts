/**
 * The Actions tab's static item list -- no single host RPC enumerates "available actions", so this
 * tab is necessarily a client-owned static list. Kept as plain data +
 * a pure filter so the matching logic is testable without rendering `PaletteSlot`; the component maps
 * each `labelKey` to its icon and `run()` behavior (those need hooks -- `useBridge()`,
 * `useTheme()` -- so they can't live in this pure module).
 */

export type PaletteActionId = "newBot" | "newRoom" | "settings" | "toggleTheme";

export interface PaletteActionDef {
  readonly id: PaletteActionId;
  /** i18n key under `palette.action.*` (see ./i18n.ts). */
  readonly labelKey: string;
}

export const PALETTE_ACTIONS: readonly PaletteActionDef[] = [
  { id: "newBot", labelKey: "palette.action.newBot" },
  { id: "newRoom", labelKey: "palette.action.newRoom" },
  { id: "settings", labelKey: "palette.action.settings" },
  { id: "toggleTheme", labelKey: "palette.action.toggleTheme" },
];

/** Actions are matched by their *resolved* label (already-translated text), not the i18n key, so
 * searching in Korean matches Korean copy -- the caller passes `label(action)` in. */
export function filterActions(actions: readonly PaletteActionDef[], labels: ReadonlyMap<PaletteActionId, string>, query: string): readonly PaletteActionDef[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return actions;
  return actions.filter((action) => (labels.get(action.id) ?? action.labelKey).toLowerCase().includes(needle));
}
