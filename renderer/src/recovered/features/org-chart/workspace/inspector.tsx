import type { OrgChartAgent } from "./model";

// @evidence src/app/dist/renderer/assets/view-D0otXpJy.js#L1
// me/te: exact agent-selection inspector, group-member projection, activity
// labels, last-activity copy, and Open chat/Open room callback seam.

export interface OrgChartInspectorAgent extends OrgChartAgent {
  name: string;
}

export interface OrgChartAgentInspectorProps {
  agent: OrgChartInspectorAgent;
  byId: ReadonlyMap<string, OrgChartInspectorAgent>;
  onOpenAgent?(agentId: string): void;
  onClose(): void;
}

function activityLabel(agent: OrgChartInspectorAgent): { text: string; tone: "green" | "tertiary" } {
  if (agent.awaitingUserResponse != null) return { text: "Waiting for you", tone: "tertiary" };
  if (agent.isRunning) return { text: "Working…", tone: "green" };
  return { text: "Idle", tone: "tertiary" };
}

function lastActivityTime(updatedAt: number): string {
  return new Date(updatedAt).toLocaleString();
}

function InitialAvatar({ agent, size }: { agent: OrgChartInspectorAgent; size: "large" | "medium" }) {
  return <span aria-hidden="true" style={{ alignItems: "center", background: "var(--cursor-bg-tertiary, #353535)", borderRadius: "50%", color: "var(--cursor-text-primary, #ececec)", display: "inline-grid", fontSize: size === "large" ? 22 : 12, height: size === "large" ? 56 : 28, justifyItems: "center", overflow: "hidden", width: size === "large" ? 56 : 28 }}>{agent.isGroup ? "◫" : agent.name.slice(0, 1).toLocaleUpperCase()}</span>;
}

export function OrgChartAgentInspector({ agent, byId, onOpenAgent, onClose }: OrgChartAgentInspectorProps) {
  const activity = activityLabel(agent);
  const members = agent.isGroup
    ? agent.memberIds.map((memberId) => byId.get(memberId)).filter((member): member is OrgChartInspectorAgent => member != null)
    : [];
  const open = () => onOpenAgent?.(agent.id);

  return <aside aria-label="Org chart details" className="sand-org-chart-inspector">
    <button aria-label="Close details" className="sand-org-chart-inspector__close" onClick={onClose} type="button">×</button>
    <div className="sand-org-chart-inspector__scroll">
      <div style={{ display: "grid", gap: 4, justifyItems: "center", padding: "8px 0 16px", textAlign: "center" }}>
        <InitialAvatar agent={agent} size="large" />
        <h2>{agent.name}</h2>
        <span style={{ color: activity.tone === "green" ? "var(--cursor-icon-green, #5fd47a)" : "var(--cursor-text-tertiary, #aaa)", fontSize: 12 }}>{activity.text}</span>
      </div>
      {agent.description?.trim() ? <div style={{ borderTop: "1px solid var(--cursor-stroke-secondary, #414141)", display: "grid", gap: 4, padding: "10px 0" }}><small style={{ color: "var(--cursor-text-tertiary, #aaa)", fontSize: 11, fontWeight: 600 }}>About</small><p style={{ color: "var(--cursor-text-secondary, #c6c6c6)", fontSize: 13, margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{agent.description.trim()}</p></div> : null}
      {members.length > 0 ? <div style={{ borderTop: "1px solid var(--cursor-stroke-secondary, #414141)", display: "grid", gap: 4, padding: "10px 0" }}><small style={{ color: "var(--cursor-text-tertiary, #aaa)", fontSize: 11, fontWeight: 600 }}>{members.length} {members.length === 1 ? "member" : "members"}</small><div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 4 }}>{members.slice(0, 12).map((member) => <span key={member.id} title={member.name}><InitialAvatar agent={member} size="medium" /></span>)}{members.length > 12 ? <span>+{members.length - 12}</span> : null}</div></div> : null}
      {agent.lastMessage?.length ? <div style={{ borderTop: "1px solid var(--cursor-stroke-secondary, #414141)", display: "grid", gap: 4, padding: "10px 0" }}><small style={{ color: "var(--cursor-text-tertiary, #aaa)", fontSize: 11, fontWeight: 600 }}>Last activity</small><p style={{ color: "var(--cursor-text-secondary, #c6c6c6)", fontSize: 13, margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{agent.lastMessage}</p><time style={{ color: "var(--cursor-text-tertiary, #aaa)", fontSize: 11 }} dateTime={new Date(agent.updatedAt).toISOString()}>{lastActivityTime(agent.updatedAt)}</time></div> : null}
      <div className="sand-org-chart-inspector__open"><button onClick={open} type="button">{agent.isGroup ? "Open room" : "Open chat"}</button></div>
    </div>
  </aside>;
}
