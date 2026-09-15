import { t, useLocale } from "../../../../production/locale";
import { formatSidebarTime } from "../../../../production/sidebar-time";
import { createElement, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { GroupHeroAvatar, type GroupHeroMember } from "../../agent-info/settings/group-hero-avatar";
import type { ConversationAgentSummary } from "./model";
import { SIDEBAR_LAYOUT_BOUNDS, SIDEBAR_LAYOUT_DEFAULTS, type SidebarLayoutState } from "./sidebar-layout-state";
import { AgentRowActions } from "../../../../production/AgentRowActions";
import { AgentNameEditor } from "../../../../production/AgentNameEditor";
import { partitionSidebarAgents, pinnedDropPosition, pinnedTileColumns } from "../../../../production/sidebar-model";
import type { SidebarSectionProjection } from "./sidebar-section-projection";
import { AGENT_NETWORK_TRIGGER } from "../../org-chart/workspace/network-trigger";
import type { SidebarSearchTrigger } from "./sidebar-search-trigger";
import {
  sidebarSectionActionState,
  sidebarSectionDeleteConfirmation,
  type SidebarSectionDeleteConfirmation,
  type SidebarSectionMovePosition
} from "./sidebar-sections-state";
import { projectSidebarAgentStatus, SidebarAgentActivity, SidebarStatusDot, type SidebarStatusDotStatus } from "./sidebar-agent-status";
import { sidebarDotTone, type SidebarDotTone } from "../../../../production/sidebar-status-dot";
import { AgentPreviewCompositor } from "./sidebar-agent-preview-content";
import type { AgentPreviewAvatarProjection } from "./sidebar-agent-preview-header";
import { SidebarSectionHeader } from "./sidebar-section-header";
import { AgentAvatar } from "./agent-avatar";
import { SandButton, SandIcon, SandIconButton } from "../../../ui/sand-kit-primitives";
import { SandContextMenu, SandMenuContent, SandMenuItem, SandMenuRoot, SandMenuTrigger } from "../../../ui/sand-floating-primitives";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2412497 (agent activity marker precedence)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1131725 (Needs attention marker label)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1131750 (Unread activity marker label)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2571206-2572518
// Ppn/Mpn: exact optional section actions, synthetic locking, and boundary-disabled movement.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2262680
// qan/xm: collapsed agent-row projection retains the avatar/action surface and marks data-collapsed.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2601270
// n0n: collapsed rail New-chat wrapper and native button callback.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2603896
// r0n/qCe: exact separator DOM and pointer lifecycle contract.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2573460
// Mpn: section-level move callback and collapsed/expanded section drag projection.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2572236
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2356500-2357600
// pcn/udn: exact multi-agent selection header, modifier-click selection, and
// bulk move/delete/clear action labels and callback seams.
// sand-agents-section__reveal: shipped section drop/reveal surface.

export interface ConversationSidebarProps {
  agents: readonly SidebarAgent[];
  sections?: readonly SidebarSectionProjection<SidebarAgent>[];
  pinnedAgentIds?: readonly string[];
  activeAgentId: string;
  /** herdr-bot (Task 5): a temporary "New chat" row shown above the real roster while the header
   * combobox is drafting a chat. Deliberately not a `SidebarAgent` -- it never enters `agents` and
   * carries none of AgentSidebarItem's roster affordances (pin/rename/delete menu, drag). */
  draftRow?: { readonly id: string; readonly name: string };
  onNewChat(): void;
  onOpenAgent(agentId: string): void;
  onRequestDeleteAgent?(agent: SidebarAgent): void;
  onRenameAgent?(agentId: string, name: string): void;
  onTogglePin?(agentId: string, isPinned: boolean): void;
  onReorderPinnedAgents?(movedId: string, targetId: string, position: "before" | "after"): void;
  onToggleSectionCollapsed?(sectionId: string, collapsed: boolean): void;
  onStartRenameSection?(sectionId: string): void;
  onRenameSection?(sectionId: string, name: string): void;
  onRequestDeleteSection?(section: { id: string; name: string }, confirmation: SidebarSectionDeleteConfirmation): void;
  onMoveSection?(sectionId: string, targetId: string, position: SidebarSectionMovePosition): void;
  onOpenNetwork?(): void;
  onOpenSearch?: SidebarSearchTrigger;
  onOpenProfile?(agentId: string): void;
  onBroadcast?(): void;
  onMoveAgentToSection?(agentIds: readonly string[], sectionId: string): void;
  onMoveAgentToNewSection?(agentIds: readonly string[]): string | null;
  selectedAgentIds?: readonly string[];
  onToggleAgentSelection?(agentId: string): void;
  onRangeSelectAgent?(agentId: string): void;
  onDeleteSelectedAgents?(): void;
  onClearAgentSelection?(): void;
  onMoveSelectedAgentsToSection?(agentIds: readonly string[], sectionId: string): void;
  onMoveSelectedAgentsToNewSection?(agentIds: readonly string[]): string | null;
  sidebarLayout?: SidebarLayoutState;
  onResize?(expandedWidth: number): void;
  onResizeEnd?(): void;
  listStatus?: ReactNode;
  isHostReachable?: boolean;
  isPreviewEnabled?: boolean;
}

export type SidebarAgent = ConversationAgentSummary & {
  description?: string;
  hasUnread?: boolean;
  isGroup?: boolean;
  raw?: { readonly isSharedRoom?: boolean };
  /** herdr-bot: the bot's herdr runtime status (idle / working / done / blocked / unknown / offline,
   * see bot-activity.ts's RUNTIME_STATUSES). Drives the status dot at the avatar's bottom-right
   * (sidebar-status-dot.ts); the blue unread dot is separate, host-owned `hasUnread` state. */
  runtimeStatus?: string;
};

export interface SidebarSelectionActionsProps {
  selectedAgentIds: readonly string[];
  selectedSectionableCount: number;
  sections?: ReadonlyArray<Pick<SidebarSectionProjection<SidebarAgent>, "id" | "name">>;
  onMoveSelectedAgentsToSection?(agentIds: readonly string[], sectionId: string): void;
  onMoveSelectedAgentsToNewSection?(agentIds: readonly string[]): string | null;
  onDeleteSelectedAgents?(): void;
  onClearAgentSelection?(): void;
  onCreatedSection?(sectionId: string): void;
}

/** Row timestamp source: the last message time when the host provides one (rename/read/status
 * bumps leave it alone), else the generic `updatedAt`. */
function rowStampAt(agent: SidebarAgent): number {
  return agent.lastMessageAt || agent.updatedAt;
}

function statusDotLabel(tone: SidebarDotTone): string {
  switch (tone) {
    case "idle": return t("Idle", "대기 중");
    case "working": return t("Working");
    case "done": return t("Done", "작업 완료");
    case "blocked": return t("Blocked", "확인 필요");
    case "unread": return t("Unread activity");
  }
}

/** herdr-bot: the one dot drawn over the avatar's bottom-right corner -- runtime status, or blue
 * unread where the layout has no trailing column for it (sidebar-status-dot.ts decides which). */
function StatusDot({ tone }: { readonly tone: SidebarDotTone | null }) {
  if (tone == null) return null;
  return <span aria-label={statusDotLabel(tone)} className="herdr-status-dot" data-tone={tone} role="status" />;
}

function activityLabel(agent: SidebarAgent): "Needs attention" | "Unread activity" | "Working" | null {
  const status = projectSidebarAgentStatus(agent);
  return status.markerLabel ?? (status.isWorking ? "Working" : null);
}

function renderPreviewAvatar(agent: SidebarAgent, avatar: AgentPreviewAvatarProjection): ReactNode {
  return <AgentAvatar agentId={avatar.agentId} kind={avatar.kind} memberIds={agent.memberIds} dataUrl={avatar.dataUrl} color={avatar.color} shape={avatar.shape} currentActivity={agent.currentActivity} isComposingMessage={agent.isComposingMessage} isRunning={agent.isRunning} awaitingUserResponse={agent.awaitingUserResponse} size={avatar.size} />;
}

function renderPreviewStatus({ ariaLabel, marker, presence }: { readonly ariaLabel: string | undefined; readonly marker: string | null; readonly presence: string | null }): ReactNode {
  if (presence == null && marker == null) return null;
  const status: SidebarStatusDotStatus = presence === "working" ? "working" : marker === "blocked" ? "needs-attention" : "info";
  return createElement("span", { "aria-label": ariaLabel, className: "sand-avatar-status-dot", role: ariaLabel == null ? undefined : "status" }, createElement(SidebarStatusDot, { status }));
}

export function AgentSidebarHeader({ onBroadcast, onNewChat, onOpenNetwork, onOpenSearch, isCollapsed = false }: Pick<ConversationSidebarProps, "onBroadcast" | "onNewChat" | "onOpenNetwork" | "onOpenSearch"> & { isCollapsed?: boolean }) {
  const hasCollaborationActions = onBroadcast != null || onOpenNetwork != null;
  return (
    <>
      <header className="sand-agents-sidebar__header">
        <div className={isCollapsed ? "sand-agents-sidebar__rail-new" : "sand-agents-sidebar__new-actions"}>
          {!isCollapsed && hasCollaborationActions ? <>
            <SandIconButton aria-label="Broadcast to agents" className="sand-agents-sidebar__broadcast" icon="megaphone" label="Broadcast to agents" onClick={onBroadcast} size="sm" />
            {onOpenNetwork == null ? null : <SandIconButton aria-label={AGENT_NETWORK_TRIGGER.ariaLabel} className={AGENT_NETWORK_TRIGGER.className} icon={AGENT_NETWORK_TRIGGER.icon} label={AGENT_NETWORK_TRIGGER.ariaLabel} onClick={onOpenNetwork} size="sm" />}
          </> : null}
          {/* @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2358208-2358400 */}
          {/* u0n: exact New chat button aria label, DOM class, native button semantics, and callback seam. */}
          <SandIconButton aria-label={t("New")} className="sand-agents-sidebar__new" icon="plus" label={t("New")} onClick={onNewChat} size="sm" shape={isCollapsed ? "circle" : "square"} title={t("New chat")} />
        </div>
      </header>
      {/* @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2605212 (a0n search control; sibling of the header) */}
      {!isCollapsed && onOpenSearch != null ? <SandButton aria-label={t("Search")} className="sand-agents-sidebar__search" onClick={onOpenSearch.onClick} onKeyDown={onOpenSearch.onKeyDown} size="md" variant="secondary"><SandIcon name="search" size="md" />{t("Search")}</SandButton> : null}
    </>
  );
}

export function SidebarSelectionActions({ selectedAgentIds, selectedSectionableCount, sections, onMoveSelectedAgentsToSection, onMoveSelectedAgentsToNewSection, onDeleteSelectedAgents, onClearAgentSelection, onCreatedSection }: SidebarSelectionActionsProps) {
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const selectedCount = selectedAgentIds.length;
  const canMove = selectedSectionableCount > 0 && (onMoveSelectedAgentsToSection != null || onMoveSelectedAgentsToNewSection != null);
  const canMoveToExisting = canMove && sections != null && sections.length > 0 && onMoveSelectedAgentsToSection != null;
  const moveLabel = selectedCount === 1 ? "Move selected agent to section" : `Move ${selectedCount} selected agents to section`;
  const deleteLabel = selectedCount === 1 ? "Delete selected agent" : `Delete ${selectedCount} selected agents`;

  const closeMoveMenu = () => {
    setMoveMenuOpen(false);
  };
  const moveToNewSection = () => {
    if (onMoveSelectedAgentsToNewSection == null) return;
    const createdSectionId = onMoveSelectedAgentsToNewSection(selectedAgentIds);
    if (createdSectionId != null) onCreatedSection?.(createdSectionId);
    closeMoveMenu();
  };

  return <header className="sand-agents-sidebar__header sand-agents-sidebar__selection-actions">
    {canMove ? <SandMenuRoot closeOnSelect={false} onOpenChange={setMoveMenuOpen} open={moveMenuOpen} placement="bottom-start">
      <SandMenuTrigger><SandButton aria-label={moveLabel} size="sm" variant="secondary">Move</SandButton></SandMenuTrigger>
      <SandMenuContent ariaLabel={t("Move to section")}>
        {canMoveToExisting ? sections?.map((section, index) => <SandMenuItem index={index} key={section.id} onSelect={() => { onMoveSelectedAgentsToSection?.(selectedAgentIds, section.id); closeMoveMenu(); }}>{section.name}</SandMenuItem>) : null}
        {onMoveSelectedAgentsToNewSection == null ? null : <SandMenuItem index={sections?.length ?? 0} onSelect={moveToNewSection}>{t("New section")}</SandMenuItem>}
      </SandMenuContent>
    </SandMenuRoot> : null}
    {onDeleteSelectedAgents == null ? null : <SandButton aria-label={deleteLabel} onClick={onDeleteSelectedAgents} sentiment="danger" size="sm">{t("Delete")}</SandButton>}
    {onClearAgentSelection == null ? null : <SandButton aria-label="Clear selection" onClick={onClearAgentSelection} size="sm" variant="secondary">Clear</SandButton>}
  </header>;
}

export interface AgentSidebarItemProps {
  agent: SidebarAgent;
  active: boolean;
  now: number;
  isCollapsed?: boolean;
  isSelected?: boolean;
  selectionEnabled?: boolean;
  sourceSectionId?: string;
  sections?: ReadonlyArray<Pick<SidebarSectionProjection<SidebarAgent>, "id" | "name">>;
  onMoveAgentToSection?: (agentIds: readonly string[], sectionId: string) => void;
  onMoveAgentToNewSection?: (agentIds: readonly string[]) => string | null;
  onToggleSelect?: (agentId: string) => void;
  onRangeSelect?: (agentId: string) => void;
  onOpen(): void;
  onRequestDelete?: (agent: SidebarAgent) => void;
  onRename?: (agentId: string, name: string) => void;
  onTogglePin?: (agentId: string, isPinned: boolean) => void;
  onReorderPinnedAgents?: (movedId: string, targetId: string, position: "before" | "after") => void;
  onOpenProfile?: (agentId: string) => void;
  isHostReachable?: boolean;
  isPreviewEnabled?: boolean;
  /** herdr-bot: resolves a group's memberIds to the name/avatar GroupHeroAvatar needs to render the
   * "나" + member cluster -- ConversationSidebar builds this from its own `agents` list (the same
   * roster the member bots' own rows come from), so no new data plumbing is required. */
  resolveMemberAvatar?: (memberId: string) => GroupHeroMember | null;
}

export function AgentSidebarItem({ agent, active, now, isCollapsed = false, isSelected = false, selectionEnabled = false, sourceSectionId, sections, onMoveAgentToSection, onMoveAgentToNewSection, onToggleSelect, onRangeSelect, onOpen, onRequestDelete, onRename, onTogglePin, onReorderPinnedAgents, onOpenProfile, isHostReachable = false, isPreviewEnabled = true, resolveMemberAvatar }: AgentSidebarItemProps) {
  const locale = useLocale();
  const [isRenaming, setIsRenaming] = useState(false);
  const activity = activityLabel(agent);
  // herdr-bot: in the expanded sidebar a pinned chat is a TILE in the grid at the top (Grok
  // reference: big avatar over a one-line name, nothing else). The collapsed sidebar has no grid;
  // pinned chats fall back to the ordinary collapsed row there. Every layout draws the herdr runtime
  // status as a dot on the avatar's bottom-right; only the expanded row has a trailing column, which
  // is where its blue unread dot goes -- a tile or collapsed row paints the avatar dot blue instead.
  const isTile = agent.isPinned === true && !isCollapsed;
  const rowLayout = isTile ? "pinned" : isCollapsed ? "collapsed" : "expanded";
  const status = projectSidebarAgentStatus({ hasUnread: agent.hasUnread, isRunning: agent.isRunning, layout: rowLayout, waitingReason: agent.waitingReason });
  const dotTone = sidebarDotTone({ hasUnread: agent.hasUnread, layout: rowLayout, runtimeStatus: agent.runtimeStatus, transportConnected: isHostReachable });
  const canMoveToSection = !agent.isPinned && sourceSectionId != null && onMoveAgentToSection != null;
  const detail = agent.draftPrompt?.trim()
      ? <>Draft: {agent.draftPrompt}</>
      : agent.waitingReason
        ? <>Waiting for you: {agent.waitingReason}</>
      : agent.lastMessage ?? null;
  const row = <button
    aria-label={agent.name}
    aria-current={active ? "page" : undefined}
    aria-pressed={selectionEnabled ? isSelected : undefined}
    className={isTile ? "sand-agent-item sand-agent-item--tile" : "sand-agent-item"}
    data-collapsed={isCollapsed || undefined}
    data-active={active || undefined}
    data-pin-slot-id={agent.isPinned ? agent.id : undefined}
    data-pinned={agent.isPinned || undefined}
    data-selected={selectionEnabled ? isSelected || undefined : undefined}
    draggable={(agent.isPinned === true && onReorderPinnedAgents != null) || canMoveToSection}
    onDragOver={(event) => {
      if (agent.isPinned !== true || onReorderPinnedAgents == null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }}
    onDragStart={(event) => {
      if (agent.isPinned === true && onReorderPinnedAgents != null) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", agent.id);
        return;
      }
      if (!canMoveToSection) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", agent.id);
    }}
    onDrop={(event) => {
      if (agent.isPinned !== true || onReorderPinnedAgents == null) return;
      const movedId = event.dataTransfer.getData("text/plain");
      if (movedId.length === 0 || movedId === agent.id) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      onReorderPinnedAgents(movedId, agent.id, pinnedDropPosition({ isTile, clientX: event.clientX, clientY: event.clientY, bounds }));
    }}
    onClick={isRenaming ? undefined : (event) => {
      if (event.detail > 1) return;
      if ((event.metaKey || event.ctrlKey) && onToggleSelect != null) {
        onToggleSelect(agent.id);
        return;
      }
      if (event.shiftKey && onRangeSelect != null) {
        onRangeSelect(agent.id);
        return;
      }
      onOpen();
    }}
    onDoubleClick={(event) => {
      event.preventDefault();
      if (onRename != null) setIsRenaming(true);
    }}
    type="button"
  >
    <span className="sand-agent-item__avatar herdr-avatar-wrap">
      {/* herdr-bot: a group shows the same "나" + member cluster as the group-settings hero
          (GroupHeroAvatar) instead of the plain member-only GroupAvatar composite. A pinned tile's
          avatar is a constant 72px ("xl", the same size as the settings hero) at every column count
          -- 2/3/4 columns only changes how many tiles fit per row (pinnedTileColumns), never the
          avatar itself; a row uses the 44px sm cluster / lg avatar. */}
      {agent.isGroup === true && agent.isSharedRoom !== true && agent.raw?.isSharedRoom !== true
        ? <GroupHeroAvatar members={(agent.memberIds ?? []).map((memberId): GroupHeroMember => resolveMemberAvatar?.(memberId) ?? { id: memberId, name: memberId })} size={isTile ? "xl" : "sm"} />
        : <span aria-hidden="true"><AgentAvatar agentId={agent.id} kind={agent.isSharedRoom === true || agent.raw?.isSharedRoom === true ? "shared-room" : "agent"} dataUrl={agent.avatarDataUrl} color={agent.avatarColor} shape={agent.avatarShape} currentActivity={agent.currentActivity} isComposingMessage={agent.isComposingMessage} isRunning={agent.isRunning} awaitingUserResponse={agent.awaitingUserResponse} size={isTile ? "xl" : "lg"} /></span>}
      <StatusDot tone={dotTone} />
    </span>
    {isCollapsed ? null : isTile ? <strong className="sand-agent-item__name">{isRenaming ? <AgentNameEditor initialValue={agent.name} onCommit={(name) => onRename?.(agent.id, name)} onExit={() => setIsRenaming(false)} /> : agent.name}</strong> : <>
      <span className="sand-agent-item__body">
        <strong className="sand-agent-item__name">{isRenaming ? <AgentNameEditor initialValue={agent.name} onCommit={(name) => onRename?.(agent.id, name)} onExit={() => setIsRenaming(false)} /> : agent.name}</strong>
        {status.isWorking || activity === "Working"
          ? <SidebarAgentActivity preview={agent.lastMessage ?? null} previewTitle={agent.lastMessage ?? undefined} />
          : detail == null ? null : <small className="sand-agent-item__preview">{detail}</small>}
      </span>
      <span className="sand-agent-item__trailing">
        <time className="sand-agent-item__time" dateTime={new Date(rowStampAt(agent)).toISOString()}>{formatSidebarTime(rowStampAt(agent), now, locale)}</time>
        {/* herdr-bot: an expanded row's blue unread dot lives at the far right; blocked is no longer a
            trailing marker -- it is one of the avatar dot's runtime-status tones. */}
        {agent.hasUnread === true ? <span aria-label={t("Unread activity")} className="herdr-unread-dot" role="status"><SidebarStatusDot status="info" /></span> : null}
      </span>
    </>}
  </button>;
  const preview = <AgentPreviewCompositor
    agent={agent}
    draftPreview={agent.draftPrompt?.trim() ?? ""}
    isEnabled={isPreviewEnabled}
    isHostReachable={isHostReachable}
    isPinned={agent.isPinned}
    renderAvatar={(avatar) => renderPreviewAvatar(agent, avatar)}
    renderStatus={renderPreviewStatus}
  >{row}</AgentPreviewCompositor>;
  // herdr-bot: the context menu (고정 · 이름 변경 / 프로필 편집 · 삭제) is gated on `onRequestDelete`,
  // which ProductionRenderer always wires. "이름 변경" opens the same inline editor as double-click;
  // "프로필 편집" opens the chat with its right-hand pane (bot settings, or the group's 설정 page);
  // a shared room has neither pane, so it gets no such item.
  const isSharedRoom = agent.isSharedRoom === true || agent.raw?.isSharedRoom === true;
  return onRequestDelete == null ? preview : <AgentRowActions agentId={agent.id} agentName={agent.name} isGroup={agent.isGroup} isPinned={agent.isPinned} onOpenProfile={isSharedRoom ? undefined : onOpenProfile} onRequestDelete={onRequestDelete} onStartRename={onRename == null ? undefined : () => setIsRenaming(true)} onTogglePin={onTogglePin}>{preview}</AgentRowActions>;
}

export interface SidebarResizeHandleProps {
  onResize(width: number): void;
  onResizeEnd(): void;
}

export function SidebarResizeHandle({ onResize, onResizeEnd }: SidebarResizeHandleProps) {
  const startLeft = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (cleanupRef.current != null) return;
    const parent = event.currentTarget.parentElement?.parentElement;
    if (parent == null) return;
    event.preventDefault();
    startLeft.current = parent.getBoundingClientRect().left;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture(pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId === pointerId) onResize(moveEvent.clientX - startLeft.current);
    };
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") cleanup();
    };
    function cleanup() {
      if (cleanupRef.current !== cleanup) return;
      cleanupRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("blur", cleanup);
      window.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("lostpointercapture", cleanup);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onResizeEnd();
    }
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("blur", cleanup);
    window.addEventListener("keydown", onKeyDown);
    target.addEventListener("lostpointercapture", cleanup);
  };
  useEffect(() => () => cleanupRef.current?.(), []);
  return <div aria-label="Resize sidebar" aria-orientation="vertical" className="sand-sidebar-resize-handle" onPointerDown={onPointerDown} role="separator" />;
}

function SidebarSectionActions({
  children,
  section,
  sections,
  onStartRename,
  onRequestDelete,
  onMove
}: {
  children: ReactNode;
  section: SidebarSectionProjection<SidebarAgent>;
  sections: readonly SidebarSectionProjection<SidebarAgent>[];
  onStartRename?: () => void;
  onRequestDelete?: () => void;
  onMove?: (targetId: string, position: SidebarSectionMovePosition) => void;
}) {
  const actionState = sidebarSectionActionState(sections, section.id);
  const [menuPoint, setMenuPoint] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const hasActions = !actionState.isSynthetic && (onStartRename != null || onRequestDelete != null || onMove != null);

  if (!hasActions) return <>{children}</>;
  const trigger = <div
    onKeyDown={(event) => {
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      setMenuPoint({ x: bounds.left, y: bounds.bottom });
    }}
    style={{ position: "relative" }}
  >{children}</div>;
  return <SandContextMenu
    children={trigger}
    content={<div aria-label="Section actions">
      <SandMenuItem disabled={onStartRename == null} index={0} onSelect={onStartRename}>{t("Rename")}</SandMenuItem>
      <SandMenuItem disabled={!actionState.canMoveUp || onMove == null || actionState.moveUpTargetId == null} index={1} onSelect={() => {
        const targetId = actionState.moveUpTargetId;
        if (targetId != null && onMove != null) onMove(targetId, "before");
      }}>Move up</SandMenuItem>
      <SandMenuItem disabled={!actionState.canMoveDown || onMove == null || actionState.moveDownTargetId == null} index={2} onSelect={() => {
        const targetId = actionState.moveDownTargetId;
        if (targetId != null && onMove != null) onMove(targetId, "after");
      }}>Move down</SandMenuItem>
      <SandMenuItem disabled={onRequestDelete == null} index={3} onSelect={onRequestDelete}>{t("Delete")}</SandMenuItem>
    </div>}
    onOpenChange={setMenuPoint}
    open={menuPoint}
  />;
}

function SidebarSectionNameEditor({ initialValue, onCommit, onExit }: { initialValue: string; onCommit(value: string): void; onExit(): void }) {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const finish = (shouldCommit: boolean, value: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const next = value.trim();
    if (shouldCommit && next.length > 0 && next !== initialValue) onCommit(next);
    onExit();
  };
  return <input
    aria-label="Rename section"
    autoComplete="off"
    data-initial={initialValue}
    onBlur={(event) => finish(true, event.currentTarget.value)}
    onChange={(event) => setDraft(event.currentTarget.value)}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false, event.currentTarget.value);
      }
    }}
    onMouseDown={(event) => event.stopPropagation()}
    ref={inputRef}
    spellCheck={false}
    value={draft}
  />;
}

export function ConversationSidebar({ agents, sections, pinnedAgentIds = [], activeAgentId, draftRow, onBroadcast, onNewChat, onOpenAgent, onRequestDeleteAgent, onRenameAgent, onTogglePin, onReorderPinnedAgents, onToggleSectionCollapsed, onStartRenameSection, onRenameSection, onRequestDeleteSection, onMoveSection, onOpenNetwork, onOpenSearch, onOpenProfile, onMoveAgentToSection, onMoveAgentToNewSection, selectedAgentIds = [], onToggleAgentSelection, onRangeSelectAgent, onDeleteSelectedAgents, onClearAgentSelection, onMoveSelectedAgentsToSection, onMoveSelectedAgentsToNewSection, sidebarLayout, onResize, onResizeEnd, listStatus, isHostReachable = false, isPreviewEnabled = true }: ConversationSidebarProps) {
  const now = Date.now();
  const isCollapsed = sidebarLayout?.isCollapsed ?? false;
  const sidebarWidthRaw = isCollapsed ? SIDEBAR_LAYOUT_BOUNDS.collapsedWidth : sidebarLayout?.expandedWidth;
  // Round: a fractional aside width leaves the column's hairline border on a half-pixel.
  const sidebarWidth = sidebarWidthRaw == null ? undefined : Math.round(sidebarWidthRaw);
  // herdr-bot: the pinned grid starts at 2 columns and grows to 3, then 4 as the user drags the
  // sidebar wider (pinnedTileColumns) -- recomputed every render off the same width the aside itself
  // uses, so the grid and the aside are always in sync. The tile avatar stays a constant 72px at
  // every column count (AgentSidebarItem's own "xl"), so growing columns never resizes it -- only
  // the per-tile grid track does, and only up to its 88px cap (see the grid's inline style below).
  const pinnedColumns = pinnedTileColumns(sidebarWidth ?? SIDEBAR_LAYOUT_DEFAULTS.expandedWidth);
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const [dropSectionId, setDropSectionId] = useState<string | null>(null);
  const { pinned: orderedPinned, unpinned } = partitionSidebarAgents(agents, pinnedAgentIds);
  // herdr-bot: a group row's GroupHeroAvatar needs each member's name/avatar, not just its id -- the
  // member bots are themselves rows in this same `agents` list, so a lookup built from it is enough;
  // no separate roster plumbing is needed.
  const agentById = useMemo(() => new Map(agents.map((candidate) => [candidate.id, candidate])), [agents]);
  const resolveMemberAvatar = (memberId: string): GroupHeroMember | null => {
    const member = agentById.get(memberId);
    return member == null ? null : { id: member.id, name: member.name, dataUrl: member.avatarDataUrl, shape: member.avatarShape, color: member.avatarColor };
  };
  const selectedIds = new Set(selectedAgentIds);
  const selectedSectionableCount = agents.filter((agent) => selectedIds.has(agent.id) && !agent.isPinned).length;
  const createSectionForSelection = onMoveSelectedAgentsToNewSection == null ? undefined : (agentIds: readonly string[]) => {
    return onMoveSelectedAgentsToNewSection(agentIds);
  };
  const renderAgent = (agent: SidebarAgent, sourceSectionId?: string) => <AgentSidebarItem active={agent.id === activeAgentId} agent={agent} isCollapsed={isCollapsed} isHostReachable={isHostReachable} isPreviewEnabled={isPreviewEnabled} key={agent.id} now={now} onMoveAgentToNewSection={onMoveAgentToNewSection == null ? undefined : (agentIds) => {
    const createdSectionId = onMoveAgentToNewSection(agentIds);
    if (createdSectionId != null) setRenamingSectionId(createdSectionId);
    return createdSectionId;
  }} onMoveAgentToSection={onMoveAgentToSection} onOpen={() => onOpenAgent(agent.id)} onOpenProfile={onOpenProfile} onRangeSelect={onRangeSelectAgent} onReorderPinnedAgents={onReorderPinnedAgents} onRequestDelete={onRequestDeleteAgent} onRename={onRenameAgent} onTogglePin={onTogglePin} onToggleSelect={onToggleAgentSelection} isSelected={selectedIds.has(agent.id)} resolveMemberAvatar={resolveMemberAvatar} selectionEnabled={selectedAgentIds.length > 0 || onToggleAgentSelection != null || onRangeSelectAgent != null} sections={sections} sourceSectionId={sourceSectionId} />;
  const draftRowNode = draftRow == null ? null : <button aria-current="page" aria-label={draftRow.name} className="sand-agent-item herdr-new-chat-draft-row" data-active key="herdr-new-chat-draft" type="button">
    <span className="sand-agent-item__avatar"><span className="herdr-new-chat-draft-row__icon"><SandIcon name="plus" size="md" /></span></span>
    {isCollapsed ? null : <span className="sand-agent-item__body"><strong className="sand-agent-item__name">{draftRow.name}</strong></span>}
  </button>;
  const draftRowBlock = draftRowNode == null ? null : <div className="sand-agents-list__rows">{draftRowNode}</div>;
  return (
    <aside aria-label={t("Agents")} className="sand-agents-sidebar" data-sidebar-collapsed={isCollapsed || undefined} style={{ width: sidebarWidth }}>
      {selectedAgentIds.length > 0 ? <SidebarSelectionActions onClearAgentSelection={onClearAgentSelection} onCreatedSection={setRenamingSectionId} onDeleteSelectedAgents={onDeleteSelectedAgents} onMoveSelectedAgentsToNewSection={createSectionForSelection} onMoveSelectedAgentsToSection={onMoveSelectedAgentsToSection} sections={sections} selectedAgentIds={selectedAgentIds} selectedSectionableCount={selectedSectionableCount} /> : <AgentSidebarHeader isCollapsed={isCollapsed} onBroadcast={onBroadcast} onNewChat={onNewChat} onOpenNetwork={onOpenNetwork} onOpenSearch={onOpenSearch} />}
      {/* @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2597261 (Wpn scroll-region carrier) */}
      <nav aria-label={t("Agent list")} className="sand-agents-list" data-sidebar-collapsed={isCollapsed || undefined} role="region" tabIndex={0}>
        {/* herdr-bot: the draft row is never a direct child of .sand-agents-list -- that carrier is a
            CSS grid whose direct children stretch to fill the remaining track, which is what turned
            the old top-level draft button into a viewport-tall box. It joins the flat rows block when
            there is one, and otherwise gets its own rows wrapper ahead of the status / sections. */}
        {listStatus != null ? <>{draftRowBlock}{listStatus}</> : <>
          {/* herdr-bot: tracks cap at 88px (72px avatar + the tile's own 8px side padding) instead of
              stretching (minmax(0, 1fr) would) -- so the avatar's size never depends on how many
              tiles fit in a row. Below that cap a track can still shrink at the narrow end of a
              column tier (never below the avatar's own 72px in practice); justify-content centers
              whatever width the tiles end up short of filling. */}
          {orderedPinned.length > 0 ? <div aria-label="Pinned agents" className="sand-agents-pinned" role="group" style={{ gridTemplateColumns: `repeat(${pinnedColumns}, minmax(0, 88px))`, justifyContent: "center" }}>{orderedPinned.map((agent) => renderAgent(agent))}</div> : null}
          {sections == null ? <div className="sand-agents-list__rows">{draftRowNode}{unpinned.map((agent) => renderAgent(agent))}</div> : <>{draftRowBlock}{sections.map((section) => isCollapsed ? section.agents.map((agent) => renderAgent(agent, section.id)) : <div
            className={dropSectionId === section.id ? "sand-agents-section sand-agents-section__reveal" : "sand-agents-section"}
            data-section-id={section.id}
            key={section.id}
            onDragLeave={() => setDropSectionId((current) => current === section.id ? null : current)}
            onDragOver={(event) => {
              if (onMoveAgentToSection == null || !event.dataTransfer.types.includes("text/plain")) return;
              event.preventDefault();
              setDropSectionId(section.id);
            }}
            onDrop={(event) => {
              if (onMoveAgentToSection == null) return;
              const agentId = event.dataTransfer.getData("text/plain");
              if (agentId.length === 0) return;
              event.preventDefault();
              setDropSectionId(null);
              onMoveAgentToSection([agentId], section.id);
            }}
          >
            <SidebarSectionActions
              onMove={onMoveSection == null ? undefined : (targetId, position) => onMoveSection(section.id, targetId, position)}
              onRequestDelete={onRequestDeleteSection == null ? undefined : () => onRequestDeleteSection({ id: section.id, name: section.name }, sidebarSectionDeleteConfirmation(section.name))}
              onStartRename={onStartRenameSection == null && onRenameSection == null ? undefined : () => {
                setRenamingSectionId(section.id);
                onStartRenameSection?.(section.id);
              }}
              section={section}
              sections={sections}
            >
              <SidebarSectionHeader
                count={section.agents.length}
                dataSectionId={section.id}
                isFolded={section.isCollapsed}
                isLocked={section.isSynthetic}
                label={section.name}
                onClick={() => onToggleSectionCollapsed?.(section.id, !section.isCollapsed)}
                renameField={renamingSectionId === section.id && onRenameSection != null ? <SidebarSectionNameEditor initialValue={section.name} onCommit={(name) => onRenameSection(section.id, name)} onExit={() => setRenamingSectionId(null)} /> : undefined}
              />
            </SidebarSectionActions>
              <div className="sand-agents-section__rows">
              {section.isCollapsed ? null : section.agents.length === 0 ? <span className="sand-agents-section__empty">Drag chats here</span> : section.agents.map((agent) => renderAgent(agent, section.id))}
            </div>
          </div>)}</>}
        </>}
      </nav>
      {onResize != null && onResizeEnd != null ? <SidebarResizeHandle onResize={onResize} onResizeEnd={onResizeEnd} /> : null}
    </aside>
  );
}
