// herdr-bot: how a group's avatar cluster (GroupHeroAvatar) lays out its four cells -- the user's own
// bubble plus up to three members -- after the Grok Bot reference.

export type GroupHeroLayout = "stack" | "grid";

export interface GroupHeroLayoutProjection {
  readonly layout: GroupHeroLayout;
  /** How many members render as avatars. */
  readonly visibleCount: number;
  /** Members folded into the trailing "+N" cell; 0 hides it. */
  readonly overflow: number;
}

/** Cells in the 2x2 grid left for members once the user's own bubble takes the first one. */
const GRID_MEMBER_CELLS = 3;
/** Below this many members the cluster stays stacked (bubble on top, members underneath). */
const GRID_MIN_MEMBERS = 3;

/**
 * 0-2 members: the stacked cluster. 3 members: a 2x2 grid, every cell filled. 4 or more: the grid
 * shows two members and spends the last cell on "+N" for the rest, so the count is always exact.
 */
export function groupHeroLayout(memberCount: number): GroupHeroLayoutProjection {
  if (memberCount < GRID_MIN_MEMBERS) return { layout: "stack", visibleCount: memberCount, overflow: 0 };
  if (memberCount <= GRID_MEMBER_CELLS) return { layout: "grid", visibleCount: memberCount, overflow: 0 };
  const visibleCount = GRID_MEMBER_CELLS - 1;
  return { layout: "grid", visibleCount, overflow: memberCount - visibleCount };
}
