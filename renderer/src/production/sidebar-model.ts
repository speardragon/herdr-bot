// Pinned sidebar ordering recovered from the shipped pinned rail.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L49795

export interface SidebarOrderAgent {
  id: string;
  isPinned?: boolean;
}

export type PinnedMovePosition = "before" | "after";

export function partitionSidebarAgents<T extends SidebarOrderAgent>(agents: readonly T[], pinnedAgentIds: readonly string[]): { pinned: T[]; unpinned: T[] } {
  const pinnedById = new Map(agents.filter((agent) => agent.isPinned).map((agent) => [agent.id, agent]));
  const pinned: T[] = [];
  const pinnedSet = new Set<string>();
  for (const agentId of pinnedAgentIds) {
    const agent = pinnedById.get(agentId);
    if (agent == null || pinnedSet.has(agent.id)) continue;
    pinned.push(agent);
    pinnedSet.add(agent.id);
  }
  for (const agent of agents) {
    if (agent.isPinned && !pinnedSet.has(agent.id)) {
      pinned.push(agent);
      pinnedSet.add(agent.id);
    }
  }
  return { pinned, unpinned: agents.filter((agent) => !pinnedSet.has(agent.id) && !agent.isPinned) };
}

/**
 * How many columns the pinned-tile grid shows, based on the sidebar's current width
 * (SIDEBAR_LAYOUT_BOUNDS: 240-400px) -- 2 at the default 280px width, growing to 3 then 4 as the
 * user drags the sidebar wider, so a full-width sidebar (near 400px) is what finally shows 4 per row.
 */
export function pinnedTileColumns(sidebarWidth: number): 2 | 3 | 4 {
  if (sidebarWidth >= 380) return 4;
  if (sidebarWidth >= 320) return 3;
  return 2;
}

/**
 * Which side of a pinned drop target the dragged chat lands on. The expanded sidebar lays pinned
 * chats out as a row-major 2-column grid of tiles, so "before" means the pointer is in the target's
 * LEFT half; the collapsed sidebar stacks them as rows, where "before" is the TOP half.
 */
export function pinnedDropPosition({ isTile, clientX, clientY, bounds }: { isTile: boolean; clientX: number; clientY: number; bounds: { left: number; top: number; width: number; height: number } }): PinnedMovePosition {
  return isTile
    ? (clientX < bounds.left + bounds.width / 2 ? "before" : "after")
    : (clientY < bounds.top + bounds.height / 2 ? "before" : "after");
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L49795
export function movePinnedAgent(storedIds: readonly string[], movedId: string, targetId: string, position: PinnedMovePosition): string[] {
  if (movedId === targetId) return [...storedIds];
  const withoutMoved = storedIds.filter((id) => id !== movedId);
  const targetIndex = withoutMoved.indexOf(targetId);
  if (targetIndex < 0) return [...storedIds];
  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  return [...withoutMoved.slice(0, insertIndex), movedId, ...withoutMoved.slice(insertIndex)];
}

/**
 * Single most-recent-message-ordered chat list (Bots + groups together). Falls back to `createdAt`
 * for a chat that has never had a message, and breaks exact ties by id so same-timestamp entries
 * (e.g. a host-assigned monotonic bump landing on the same ms) still sort deterministically. Renaming,
 * marking read, or a working/done status change never touches `lastMessageAt`, so none of those
 * reorder the list -- only a new message (host-bumped `lastMessageAt`) does.
 */
export function sortRecentChats<T extends { id: string; lastMessageAt: number; createdAt: number }>(agents: readonly T[]): T[] {
  return [...agents].sort((a, b) =>
    (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt)
    || a.id.localeCompare(b.id));
}

/**
 * The sidebar's flat visible order: chats the user pinned (row menu "고정"), in `pinnedAgentIds` order,
 * followed by the rest in `sortRecentChats` order. This is the flattened form of what
 * `ConversationSidebar` renders via `partitionSidebarAgents` (pinned group first, then unpinned) and
 * is what row-index shortcuts (Cmd+N → focusAgent) resolve against, so the shortcut always opens the
 * Nth row the user sees. Pinned-ness comes from `pinnedAgentIds` rather than an `isPinned` field so it
 * works on the raw roster too; ids with no matching chat (a pinned bot that was deleted) are skipped.
 */
export function projectSidebarOrder<T extends { id: string; lastMessageAt: number; createdAt: number }>(agents: readonly T[], pinnedAgentIds: readonly string[]): T[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  // Set keeps insertion order (spec-guaranteed), so this both dedupes and preserves pin order.
  const pinnedSet = new Set(pinnedAgentIds.filter((id) => byId.has(id)));
  const pinned = [...pinnedSet].map((id) => byId.get(id) as T);
  return [...pinned, ...sortRecentChats(agents.filter((agent) => !pinnedSet.has(agent.id)))];
}
