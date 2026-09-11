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
