import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  ConversationOutlineItem,
  ConversationOutlineProvider,
  ConversationOutlineSnapshot,
} from "./conversation-outline-provider";
import { useMovablePanel } from "../../../ui/movable-panel";
import { SandIcon, SandIconButton, type SandIconName } from "../../../ui/sand-kit-primitives";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4911773 (wSn panel)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4905208 (fSn row labels/icons)

export type ConversationOutlineSubagentStatus = "running" | "done" | "error" | "aborted";

export interface ConversationOutlineSubagent {
  readonly subagentId: string;
  readonly subagentType: string;
  readonly title: string;
  readonly status: ConversationOutlineSubagentStatus;
}

export interface ConversationOutlinePanelProps {
  readonly agentId: string;
  readonly agentName?: string;
  readonly provider: ConversationOutlineProvider;
  readonly subagents?: readonly ConversationOutlineSubagent[];
  readonly onClose: () => void;
}

interface OutlineTab {
  readonly id: string;
  readonly label: string;
  readonly status?: ConversationOutlineSubagentStatus;
}

function formatToolName(name: string): string {
  const withoutSuffix = name.endsWith("ToolCall") ? name.slice(0, -8) : name;
  if (withoutSuffix.length === 0) return name;
  const spaced = withoutSuffix.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

function tabLabel(subagent: ConversationOutlineSubagent): string {
  const title = subagent.title.trim();
  return title.length > 0 ? `${subagent.subagentType}: ${title}` : subagent.subagentType;
}

function itemLabel(item: ConversationOutlineItem): string {
  switch (item.kind) {
    case "user": return "You";
    case "thinking": return "Thinking";
    case "assistant-text": return "Agent";
    case "send-message": return "Message";
    case "tool-call": return formatToolName(item.name);
  }
}

function itemIcon(item: ConversationOutlineItem): SandIconName {
  switch (item.kind) {
    case "user": return "person-circle";
    case "thinking": return "thinking-medium";
    case "assistant-text": return "sparkle";
    case "send-message": return "send";
    case "tool-call": return item.status === "pending" ? "loading" : item.status === "failed" ? "x-circle" : "wrench";
  }
}

function itemIconClass(item: ConversationOutlineItem): string {
  if (item.kind === "thinking") return "sand-outline-item__icon sand-2lah0s sand-kbann2";
  if (item.kind === "send-message") return "sand-outline-item__icon sand-2lah0s sand-hqjymj";
  if (item.kind === "tool-call" && item.status === "failed") return "sand-outline-item__icon sand-2lah0s sand-pmgbkh";
  return "sand-outline-item__icon sand-2lah0s sand-4b2ntj";
}

function itemPreview(item: ConversationOutlineItem): string {
  const value = item.kind === "tool-call"
    ? item.summary ?? ""
    : item.kind === "send-message"
      ? item.message.type === "text" ? item.message.content : item.message.url
      : item.text;
  return value.trim().split(/\r?\n/, 1)[0] ?? "";
}

function itemDetail(item: ConversationOutlineItem): { label?: string; text: string }[] {
  const text = item.kind === "tool-call"
    ? item.summary ?? ""
    : item.kind === "send-message"
      ? item.message.type === "text" ? item.message.content : item.message.url
      : item.text;
  return text.trim().length === 0 ? [] : [{ label: item.kind === "tool-call" ? "summary" : "text", text }];
}

function tabStatusClass(status: ConversationOutlineSubagentStatus): string {
  if (status === "running") return "sand-outline-tab__status sand-bhuhuz";
  if (status === "done") return "sand-outline-tab__status sand-4avp86";
  return "sand-outline-tab__status sand-1fjnnm2";
}

function OutlineItemRow({ item, expanded, idPrefix, onToggle }: { item: ConversationOutlineItem; expanded: boolean; idPrefix: string; onToggle(id: string): void }) {
  const detailId = `${idPrefix}-detail-${encodeURIComponent(item.id)}`;
  const preview = itemPreview(item);
  const details = itemDetail(item);
  const pending = item.kind === "tool-call" && item.status === "pending";
  const status = item.kind === "tool-call" ? item.status : undefined;
  return <div className="sand-outline-item" data-kind={item.kind} data-status={status} role="listitem">
    <button aria-controls={expanded ? detailId : undefined} aria-expanded={expanded} className="sand-outline-item__row" onClick={() => onToggle(item.id)} type="button">
      <span aria-hidden="true" className={itemIconClass(item)} data-active={pending || undefined} data-failed={item.kind === "tool-call" && item.status === "failed" || undefined} data-icon-name={itemIcon(item)} style={pending ? { animation: "sand-outline-item-spin .9s linear infinite" } : undefined}><SandIcon name={itemIcon(item)} size="sm" /></span>
      <span className="sand-outline-item__label">{itemLabel(item)}</span>
      {preview.length > 0 ? <span className="sand-outline-item__preview">{preview}</span> : null}
      <span aria-hidden="true" className="sand-outline-item__chevron" style={{ transform: expanded ? "rotate(45deg)" : "rotate(-45deg)" }} />
    </button>
    {expanded ? <div className="sand-outline-item__detail" id={detailId}>
      {details.length === 0 ? <span>No additional details.</span> : details.map((detail) => <div className="sand-outline-item__detail-section" key={detail.label ?? "text"}>
        {detail.label == null ? null : <span className="sand-outline-item__detail-label">{detail.label}</span>}
        <pre className="sand-outline-item__detail-text">{detail.text}</pre>
      </div>)}
    </div> : null}
  </div>;
}

function OutlineTabs({ tabs, selectedId, panelId, onSelect }: { tabs: readonly OutlineTab[]; selectedId: string; panelId: string; onSelect(id: string): void }) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  if (tabs.length <= 1) return null;
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : event.key === "ArrowRight" ? (index + 1) % tabs.length
        : event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (next == null) return;
    onSelect(next.id);
    tabRefs.current.get(next.id)?.focus();
  };
  return <div aria-orientation="horizontal" className="sand-outline-panel__tabs" role="tablist">
    {tabs.map((tab, index) => <button aria-controls={panelId} aria-selected={tab.id === selectedId} className="sand-outline-tab" id={`${panelId}-${encodeURIComponent(tab.id)}`} key={tab.id} onClick={() => onSelect(tab.id)} onKeyDown={(event) => move(event, index)} ref={(node) => { if (node == null) tabRefs.current.delete(tab.id); else tabRefs.current.set(tab.id, node); }} role="tab" tabIndex={tab.id === selectedId ? 0 : -1} type="button">
      {tab.status == null ? null : <span aria-hidden="true" className={tabStatusClass(tab.status)} />}
      <span className="sand-outline-tab__label">{tab.label}</span>
    </button>)}
  </div>;
}

export function ConversationOutlinePanel({ agentId, agentName, provider, subagents = [], onClose }: ConversationOutlinePanelProps) {
  const [selectedId, setSelectedId] = useState(agentId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement | null>(null);
  const tabs = useMemo<readonly OutlineTab[]>(() => [{ id: agentId, label: agentName != null && agentName.length > 0 ? agentName : "Conversation" }, ...subagents.map((subagent) => ({ id: subagent.subagentId, label: tabLabel(subagent), status: subagent.status }))], [agentId, agentName, subagents]);
  const validSelectedId = tabs.some((tab) => tab.id === selectedId) ? selectedId : agentId;
  const selectedSubagent = subagents.find((subagent) => subagent.subagentId === validSelectedId);
  const snapshotHandle = useMemo(() => provider.snapshotsFor(validSelectedId), [provider, validSelectedId]);
  const snapshot: ConversationOutlineSnapshot = useSyncExternalStore(snapshotHandle.subscribe, snapshotHandle.get, snapshotHandle.get);
  const { attachPanel, onHeaderPointerDown } = useMovablePanel();

  useEffect(() => {
    setSelectedId(agentId);
    setExpanded(new Set());
  }, [agentId]);
  useEffect(() => {
    const release = provider.retain(validSelectedId, selectedSubagent?.status === "running" ? { pollIntervalMs: 2000 } : undefined);
    return release;
  }, [provider, selectedSubagent?.status, validSelectedId]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);
  useEffect(() => {
    if (snapshot.items.length === 0 || listRef.current == null) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [snapshot.items.length, validSelectedId]);

  const title = `Full conversation: ${agentName != null && agentName.length > 0 ? agentName : "Conversation"}`;
  const panelTitleId = "sand-outline-panel-title";
  const panelId = "sand-outline-panel-tabs";
  const listIdPrefix = "sand-outline";
  return <aside aria-label={title} className="sand-outline-panel" data-status={snapshot.status} ref={attachPanel} role="dialog">
    <header className="sand-outline-panel__header" onPointerDown={onHeaderPointerDown}>
      <div className="sand-outline-panel__title">
        <SandIcon name="list-bullets" size="sm" />
        <div className="sand-outline-panel__title-text"><span id={panelTitleId}>Full conversation</span><span>{agentName != null && agentName.length > 0 ? agentName : "Conversation"}</span></div>
      </div>
      <SandIconButton aria-label="Close full conversation" icon="close" onClick={onClose} shape="circle" size="sm" type="button" variant="ghost" />
    </header>
    <OutlineTabs panelId={panelId} selectedId={validSelectedId} tabs={tabs} onSelect={(id) => { setSelectedId(id); setExpanded(new Set()); }} />
    <div aria-labelledby={panelTitleId} aria-busy={snapshot.status === "loading" || undefined} className="sand-outline-panel__list" id={panelId} ref={listRef} role={tabs.length > 1 ? "tabpanel" : undefined}>
      <div aria-labelledby={panelTitleId} role="list">
        {snapshot.items.length === 0 ? <div className="sand-outline-empty">No conversation activity yet.</div> : snapshot.items.map((item) => <OutlineItemRow expanded={expanded.has(item.id)} idPrefix={listIdPrefix} item={item} key={item.id} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />)}
      </div>
    </div>
  </aside>;
}
