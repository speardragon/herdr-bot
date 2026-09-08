import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import { SandContextMenu, SandMenuContent, SandMenuItem, SandMenuRoot, SandMenuTrigger } from "../recovered/ui/sand-floating-primitives";
import {
  AGENT_ROW_ACTIONS_LABEL,
  agentRowActions,
  isCopyConversationIdAction,
  isDeleteAgentAction,
  isDuplicateAgentAction,
  isHideFromSidebarAction,
  isMarkAgentUnreadAction,
  isTogglePinAction,
  markAgentUnreadValue,
  togglePinValue
} from "./agent-row-actions-model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L51965
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2345000
// fcn/rcn/zct: exact agent-row section submenu, labels, current-section projection,
// and new-section callback seam.

export interface AgentRowActionsProps {
  agentId: string;
  agentName: string;
  isGroup?: boolean;
  isPinned?: boolean;
  hasUnread?: boolean;
  isHidden?: boolean;
  onHideFromSidebar(agentId: string): void;
  onCopyConversationId?(agentId: string): void;
  onDuplicateAgent?(agentId: string): void;
  onTogglePin?(agentId: string, isPinned: boolean): void;
  onSetAgentUnread?(agentId: string, isUnread: boolean): void;
  sections?: readonly { id: string; name: string }[];
  currentSectionId?: string;
  onMoveToSection?(sectionId: string): void;
  onMoveToNewSection?(): void;
  onOpenProfile?(agentId: string): void;
  onShowFullConversation?(agentId: string): void;
  onShowAsyncTasks?(agentId: string): void;
  onRequestDelete?(agent: { id: string; name: string; isGroup?: boolean }): void;
  children: ReactNode;
}

export function AgentRowActions({ agentId, agentName, isPinned = false, hasUnread = false, isGroup, isHidden = false, onHideFromSidebar, onCopyConversationId, onDuplicateAgent, onTogglePin, onRequestDelete, onSetAgentUnread, sections, currentSectionId, onMoveToSection, onMoveToNewSection, onOpenProfile, onShowFullConversation, onShowAsyncTasks, children }: AgentRowActionsProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const actions = agentRowActions({ hasUnread, isHidden, isPinned, includeCopy: onCopyConversationId != null, includeDelete: onRequestDelete != null, includeDuplicate: onDuplicateAgent != null, includeMarkUnread: onSetAgentUnread != null, includePin: onTogglePin != null });

  const openAt = (x: number, y: number) => {
    if (actions.length === 0) return;
    setMoveMenuOpen(false);
    setMenu({ x, y });
  };
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    openAt(event.clientX, event.clientY);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    openAt(bounds.left + 8, bounds.bottom);
  };

  const canMoveToSection = !isPinned && !isHidden && (onMoveToNewSection != null || (sections != null && sections.length > 0 && onMoveToSection != null));
  const sectionLabel = sections != null && sections.length > 0 ? "Move to" : "Move to new section";
  const closeMenu = () => {
    setMenu(null);
    setMoveMenuOpen(false);
  };

  const content = <div className="ui-menu__list" data-component="menu-list">
    {onOpenProfile == null ? null : <SandButton onClick={() => { closeMenu(); onOpenProfile(agentId); }} leadingIcon="pencil" role="menuitem" size="sm" variant="secondary">Edit Profile</SandButton>}
    {onShowFullConversation == null ? null : <SandButton onClick={() => { closeMenu(); onShowFullConversation(agentId); }} leadingIcon="list-bullets" role="menuitem" size="sm" variant="secondary">Show full conversation</SandButton>}
    {onShowAsyncTasks == null ? null : <SandButton onClick={() => { closeMenu(); onShowAsyncTasks(agentId); }} leadingIcon="clock" role="menuitem" size="sm" variant="secondary">Show async tasks</SandButton>}
    {canMoveToSection ? sections != null && sections.length > 0 ? <>
      <SandMenuRoot closeOnSelect={false} onOpenChange={setMoveMenuOpen} open={moveMenuOpen} placement="right-start">
        <SandMenuTrigger><SandButton aria-expanded={moveMenuOpen} aria-haspopup="menu" role="menuitem" size="sm" variant="secondary">{sectionLabel}</SandButton></SandMenuTrigger>
        <SandMenuContent ariaLabel="Move to section">
          {onMoveToSection == null ? null : sections.map((section, index) => <SandMenuItem index={index} key={section.id} onSelect={() => { closeMenu(); onMoveToSection(section.id); }}>{section.name}</SandMenuItem>)}
          {onMoveToNewSection == null ? null : <SandMenuItem index={sections.length} onSelect={() => { closeMenu(); onMoveToNewSection(); }}>New section</SandMenuItem>}
        </SandMenuContent>
      </SandMenuRoot>
    </> : <SandButton onClick={() => { closeMenu(); onMoveToNewSection?.(); }} role="menuitem" size="sm" variant="secondary">Move to new section</SandButton> : null}
    {actions.map((action) => <SandButton
      key={action.id}
      onClick={() => {
        closeMenu();
        if (isTogglePinAction(action)) onTogglePin?.(agentId, togglePinValue(action));
        else if (isDuplicateAgentAction(action)) onDuplicateAgent?.(agentId);
        else if (isCopyConversationIdAction(action)) onCopyConversationId?.(agentId);
        else if (isMarkAgentUnreadAction(action)) onSetAgentUnread?.(agentId, markAgentUnreadValue(action));
        else if (isHideFromSidebarAction(action)) onHideFromSidebar(agentId);
        else if (isDeleteAgentAction(action)) onRequestDelete?.({ id: agentId, name: agentName, isGroup });
      }}
      role="menuitem"
      size="sm"
      variant="secondary"
    >{action.label}</SandButton>)}
  </div>;

  return <SandContextMenu ariaLabel={AGENT_ROW_ACTIONS_LABEL} content={content} onOpenChange={(next) => { setMenu(next); if (next == null) setMoveMenuOpen(false); }} open={menu}>
    <div onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}>
      {children}
    </div>
  </SandContextMenu>;
}
