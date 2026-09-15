// herdr-bot: the group info pane is two pages after the Grok Bot reference.
//   settings  -- header `<` 설정 `>>`, avatar hero + 이름/설명 fields. Opened by the chat header.
//   members   -- header ⚙ `>>` only, 멤버 list + 멤버 추가. Reached via `<` from settings.
// Pure (no runtime imports) so node:test loads it directly; ProductionRenderer owns the state.
export type GroupInfoPage = "settings" | "members";
export type GroupInfoOpenSource = "header" | "palette-group" | "palette-members";

export interface GroupInfoPaneChrome {
  /** Locale key for the centred title, or null for the untitled members header. */
  readonly title: "Settings" | null;
  /** Page the `<` button goes to, or null to hide the button. */
  readonly back: GroupInfoPage | null;
  /** Page the ⚙ button goes to, or null to hide the button. */
  readonly settings: GroupInfoPage | null;
}

export function initialGroupInfoPage(source: GroupInfoOpenSource): GroupInfoPage {
  return source === "palette-members" ? "members" : "settings";
}

export function groupInfoPaneChrome(page: GroupInfoPage): GroupInfoPaneChrome {
  return page === "settings"
    ? { title: "Settings", back: "members", settings: null }
    : { title: null, back: null, settings: "settings" };
}
