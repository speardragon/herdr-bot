export interface OrgChartAgent {
  id: string;
  name?: string;
  description?: string;
  hasUnread?: boolean;
  lastMessage?: string;
  isGroup: boolean;
  memberIds: readonly string[];
  conversationPartnerIds: readonly string[];
  awaitingUserResponse: unknown | null;
  isRunning: boolean;
  updatedAt: number;
}

export type OrgChartEdgeKind = "membership" | "message";
export type OrgChartEdgeActivity = "idle" | "recent" | "talking";
export type OrgChartAgentActivity = "idle" | "typing" | "working" | "waiting";

export interface OrgChartAgentSelection {
  readonly kind: "agent";
  readonly id: string;
}

export interface OrgChartEdge {
  key: string;
  sourceId: string;
  targetId: string;
  kind: OrgChartEdgeKind;
}

const RECENT_EDGE_WINDOW_MS = 2 * 60_000;

export function buildOrgChartEdges(agents: readonly OrgChartAgent[]): OrgChartEdge[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const edges: OrgChartEdge[] = [];
  const seen = new Set<string>();
  for (const agent of agents) {
    if (agent.isGroup) {
      for (const memberId of agent.memberIds) {
        if (memberId === agent.id || !byId.has(memberId)) continue;
        const key = `member::${agent.id}::${memberId}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ key, sourceId: agent.id, targetId: memberId, kind: "membership" });
        }
      }
      continue;
    }
    for (const partnerId of agent.conversationPartnerIds) {
      if (partnerId === agent.id || !byId.has(partnerId)) continue;
      const [sourceId, targetId] = agent.id < partnerId ? [agent.id, partnerId] : [partnerId, agent.id];
      const key = `msg::${sourceId}::${targetId}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ key, sourceId, targetId, kind: "message" });
      }
    }
  }
  return edges;
}

export function isMidTurn(agent: OrgChartAgent): boolean {
  return agent.awaitingUserResponse == null && agent.isRunning;
}

export function getEdgeActivity(edge: OrgChartEdge, agentsById: ReadonlyMap<string, OrgChartAgent>, now: number): OrgChartEdgeActivity {
  const source = agentsById.get(edge.sourceId);
  const target = agentsById.get(edge.targetId);
  if (source == null || target == null) return "idle";
  if (isMidTurn(source) && isMidTurn(target)) return "talking";
  return now - Math.min(source.updatedAt, target.updatedAt) <= RECENT_EDGE_WINDOW_MS ? "recent" : "idle";
}

export function getAgentActivity(agent: OrgChartAgent, isTyping: (agent: OrgChartAgent) => boolean, isWorking: (agent: OrgChartAgent) => boolean): OrgChartAgentActivity {
  if (agent.awaitingUserResponse != null) return "waiting";
  if (isTyping(agent)) return "typing";
  if (isWorking(agent)) return "working";
  return "idle";
}

export function toggleOrgChartAgentSelection(current: OrgChartAgentSelection | null, id: string): OrgChartAgentSelection | null {
  return current?.kind === "agent" && current.id === id ? null : { kind: "agent", id };
}

export function reconcileOrgChartAgentSelection(selection: OrgChartAgentSelection | null, agents: readonly Pick<OrgChartAgent, "id">[]): OrgChartAgentSelection | null {
  if (selection == null || agents.some((agent) => agent.id === selection.id)) return selection;
  return null;
}
