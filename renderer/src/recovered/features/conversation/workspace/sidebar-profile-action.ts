// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2346273 (tcn Edit Profile action; source region 2346273-2346574; sha256 bf4b930a63d74b56b724cdbdd7e7778b4e16d9203ea9a38d96788577aa6eb05c)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5563541 (root onOpenProfile:Jr injection)

/**
 * The shipped agent context menu forwards the selected agent id to its
 * profile opener. The menu primitive owns dismissal; the root owns selecting
 * the agent, opening the mounted details surface, and account/generation
 * fencing. This leaf therefore carries no async work or local lifecycle.
 */
export interface SidebarProfileActionActions {
  openProfile(agentId: string): void;
}

export const SIDEBAR_PROFILE_ACTION = {
  icon: "pencil",
  label: "Edit Profile",
} as const;

export interface SidebarProfileAction {
  onSelect(agentId: string): void;
}

export function createSidebarProfileAction(actions: SidebarProfileActionActions): SidebarProfileAction {
  return {
    onSelect: actions.openProfile,
  };
}
