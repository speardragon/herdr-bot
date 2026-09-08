import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { layoutOrgChart, panViewport, wheelZoomFactor, zoomViewport, type Viewport } from "./layout";
import { buildOrgChartEdges, getEdgeActivity, type OrgChartAgent } from "./model";
import "./graph.css";

export interface RenderableOrgChartAgent extends OrgChartAgent {
  name: string;
}

export interface OrgChartGraphProps {
  agents: readonly RenderableOrgChartAgent[];
  width?: number;
  height?: number;
  now?: number;
  selectedAgentId?: string | null;
  onSelectAgent?(agentId: string): void;
  onOpenAgent?(agentId: string): void;
}

export function OrgChartGraph({ agents, width = 760, height = 500, now = Date.now(), selectedAgentId, onSelectAgent, onOpenAgent }: OrgChartGraphProps) {
  const edges = useMemo(() => buildOrgChartEdges(agents), [agents]);
  const positions = useMemo(() => layoutOrgChart({ nodeIds: [...agents].sort((a, b) => Number(b.isGroup) - Number(a.isGroup) || a.id.localeCompare(b.id)).map((agent) => agent.id), edges, width, height }), [agents, edges, width, height]);
  const byId = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const selected = selectedAgentId === undefined ? localSelected : selectedAgentId;
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(viewport);
  const pointerRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number; isMoved: boolean } | null>(null);
  const updateViewport = (next: Viewport) => {
    if (next.scale === viewportRef.current.scale && next.x === viewportRef.current.x && next.y === viewportRef.current.y) return;
    viewportRef.current = next;
    setViewport(next);
  };

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene == null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setIsPanning(false);
      const rect = scene.getBoundingClientRect();
      const multiplier = wheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey);
      updateViewport(zoomViewport(viewportRef.current, multiplier, { x: event.clientX - rect.left, y: event.clientY - rect.top }, { width, height }));
    };
    scene.addEventListener("wheel", onWheel, { passive: false });
    return () => scene.removeEventListener("wheel", onWheel);
  }, [height, width]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, isMoved: false };
    setIsPanning(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer == null || pointer.pointerId !== event.pointerId) return;
    if (!pointer.isMoved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) {
      pointer.isMoved = true;
      setIsPanning(true);
    }
    const delta = { x: event.clientX - pointer.lastX, y: event.clientY - pointer.lastY };
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    if (pointer.isMoved) updateViewport(panViewport(viewportRef.current, delta, { width, height }, 0.5));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerRef.current = null;
    setIsPanning(false);
  };

  const resetViewport = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || pointerRef.current?.isMoved) return;
    updateViewport({ scale: 1, x: 0, y: 0 });
  };

  if (agents.length === 0) {
    return (
      <div aria-label="Agent network" className="sand-org-chart-network__empty" role="region">
        No agents yet. Create a few teammates and the network draws itself.
      </div>
    );
  }

  return (
    <div aria-label="Agent network" className="sand-org-chart-network" role="region" style={{ width, height }}>
      <div
        className="sand-org-chart-network__scene"
        onDoubleClick={resetViewport}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        ref={sceneRef}
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`, transformOrigin: "0 0", touchAction: "none", cursor: isPanning ? "grabbing" : "grab" }}
      >
        <svg aria-hidden="true" height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }} viewBox={`0 0 ${width} ${height}`} width={width}>
          {edges.map((edge) => {
            const source = positions.get(edge.sourceId);
            const target = positions.get(edge.targetId);
            if (source == null || target == null) return null;
            return <line
              className="sand-org-chart-network__edge"
              data-activity={getEdgeActivity(edge, byId, now)}
              data-kind={edge.kind}
              key={edge.key}
              x1={source.x}
              x2={target.x}
              y1={source.y}
              y2={target.y}
            />;
          })}
        </svg>
        {agents.map((agent) => {
          const point = positions.get(agent.id);
          if (point == null) return null;
          const caption = agent.awaitingUserResponse != null ? "Waiting for you" : agent.isRunning ? "Working…" : agent.isGroup ? `${agent.memberIds.length} ${agent.memberIds.length === 1 ? "member" : "members"}` : "";
          const labelId = `${agent.id}-name`;
          const detailsId = `${agent.id}-details`;
          return (
            <button
              aria-describedby={caption.length > 0 ? detailsId : undefined}
              aria-labelledby={`${labelId} ${detailsId}`}
              aria-pressed={selected === agent.id}
              className="sand-org-chart-network__node"
              data-agent-id={agent.id}
              data-group={agent.isGroup || undefined}
              key={agent.id}
              onClick={() => {
                setLocalSelected(agent.id);
                onSelectAgent?.(agent.id);
                onOpenAgent?.(agent.id);
              }}
              style={{ left: point.x, top: point.y }}
              type="button"
            >
              <span aria-hidden="true">{agent.isGroup ? "◫" : agent.name.slice(0, 1).toLocaleUpperCase()}</span>
              <strong id={labelId}>{agent.name}</strong>
              <span hidden id={detailsId}>details</span>
              {caption ? <small>{caption}</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
