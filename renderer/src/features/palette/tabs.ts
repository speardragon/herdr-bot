/**
 * Which tab strip entries the palette shows ("All | Messages | Bots | Groups | Actions", only
 * showing tabs that have real data). "All" and "Actions" are structural (a
 * static action list always exists, and "All" is the default landing tab) and always shown; "Messages"
 * reflects a global host capability (`message.search`) rather than a per-query count, so it's always
 * offered too -- only "Bots"/"Groups" depend on whether the workspace actually has any chat of that
 * kind (a fresh install with zero rooms has no reason to offer an empty "Groups" tab). Pure so the
 * decision is unit-testable without rendering the tab strip.
 */

export type PaletteTabId = "all" | "messages" | "bots" | "groups" | "actions";

export interface PaletteTabCounts {
  readonly bots: number;
  readonly groups: number;
}

export function visibleTabs(counts: PaletteTabCounts): readonly PaletteTabId[] {
  const tabs: PaletteTabId[] = ["all", "messages"];
  if (counts.bots > 0) tabs.push("bots");
  if (counts.groups > 0) tabs.push("groups");
  tabs.push("actions");
  return tabs;
}
