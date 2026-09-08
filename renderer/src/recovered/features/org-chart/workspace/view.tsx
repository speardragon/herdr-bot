import { useMemo, useState } from "react";
import type { OrgChartAgent, OrgChartEdge } from "./model";
import { buildOrgChartEdges } from "./model";
import { OrgChartGraph, type RenderableOrgChartAgent } from "./graph";
import { OrgChartAgentInspector, type OrgChartInspectorAgent } from "./inspector";

// @evidence src/app/dist/renderer/assets/view-D0otXpJy.js#L1

export interface OrgChartWorkspaceProps {
  params: Record<string, never>;
  agents?: readonly (OrgChartAgent | RenderableOrgChartAgent)[];
  onClose?(): void;
  onOpenAgent?(agentId: string): void;
  renderGraph?: (agents: readonly OrgChartAgent[], edges: readonly OrgChartEdge[]) => React.ReactNode;
}

export function orgChartSummary(agents: readonly OrgChartAgent[], edges: readonly OrgChartEdge[]): string {
  const groups = agents.filter((agent) => agent.isGroup).length;
  const agentCount = agents.length - groups;
  const links = edges.filter((edge) => edge.kind === "message").length;
  return `${agentCount} ${agentCount === 1 ? "agent" : "agents"} · ${groups} ${groups === 1 ? "group" : "groups"} · ${links} message ${links === 1 ? "link" : "links"}`;
}

export default function OrgChartWorkspaceView({ agents = [], onClose, onOpenAgent, renderGraph }: OrgChartWorkspaceProps) {
  const edges = buildOrgChartEdges(agents);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const renderableAgents = useMemo(() => agents.filter((agent): agent is OrgChartInspectorAgent => "name" in agent && typeof agent.name === "string"), [agents]);
  const byId = useMemo(() => new Map(renderableAgents.map((agent) => [agent.id, agent])), [renderableAgents]);
  const selectedAgent = selectedAgentId == null ? undefined : byId.get(selectedAgentId);
  const graph = renderGraph
    ? renderGraph(agents, edges)
    : <OrgChartGraph agents={renderableAgents as RenderableOrgChartAgent[]} onOpenAgent={onOpenAgent} onSelectAgent={setSelectedAgentId} selectedAgentId={selectedAgentId} />;
  return <div className="sand-org-chart">
    <header className="sand-org-chart__header">
      <div className="sand-org-chart__heading"><h1>Org chart</h1><small>{orgChartSummary(agents, edges)}</small></div>
      <span aria-hidden="true" style={{ flexGrow: 1 }} />
      <button aria-label="Close org chart" className="sand-org-chart__close" onClick={onClose} type="button">×</button>
    </header>
    <div className="sand-org-chart__stage">{graph}{selectedAgent == null ? null : <OrgChartAgentInspector agent={selectedAgent} byId={byId} onClose={() => setSelectedAgentId(null)} onOpenAgent={onOpenAgent} />}</div>
    <footer className="sand-org-chart__footer">Solid links are real agent-to-agent message history; dashed links are group membership. A link lights up while both agents are mid-turn. Scroll to zoom, drag to pan, double-click to reset.</footer>
  </div>;
}
