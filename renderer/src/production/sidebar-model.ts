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
