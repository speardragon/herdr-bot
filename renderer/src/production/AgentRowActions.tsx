import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import { SandContextMenu, SandMenuContent, SandMenuItem, SandMenuRoot, SandMenuTrigger } from "../recovered/ui/sand-floating-primitives";
import {
  AGENT_ROW_ACTIONS_LABEL,
  type AgentRowAction,
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

type MenuIcon = "pin" | "pin-slash" | "bell" | "bell-slash" | "copy" | "eye-slash" | "trash" | "pencil" | "folder-plus" | "list-bullets" | "clock";

function iconForAction(action: AgentRowAction): MenuIcon {
  if (isTogglePinAction(action)) return togglePinValue(action) ? "pin" : "pin-slash";
  if (isMarkAgentUnreadAction(action)) return markAgentUnreadValue(action) ? "bell" : "bell-slash";
  if (isHideFromSidebarAction(action)) return "eye-slash";
  if (isDeleteAgentAction(action)) return "trash";
  return "copy";
}

function menuItem(key: string, label: string, icon: MenuIcon, onClick: () => void, sentiment?: "danger"): ReactNode {
  return <SandButton key={key} leadingIcon={icon} onClick={onClick} role="menuitem" sentiment={sentiment} size="md" variant="secondary">{label}</SandButton>;
}

/** Drops empty groups and puts a rule between the survivors. */
function withSeparators(groups: readonly (readonly ReactNode[])[]): ReactNode[] {
  const present = groups.map((group) => group.filter((node) => node != null)).filter((group) => group.length > 0);
  return present.flatMap((group, index) => index === 0 ? group : [<div aria-hidden="true" className="sand-agent-menu__separator" key={`separator-${index}`} role="separator" />, ...group]);
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

  const select = (run: () => void) => () => { closeMenu(); run(); };
  const runAction = (action: AgentRowAction) => {
    if (isTogglePinAction(action)) onTogglePin?.(agentId, togglePinValue(action));
    else if (isDuplicateAgentAction(action)) onDuplicateAgent?.(agentId);
    else if (isCopyConversationIdAction(action)) onCopyConversationId?.(agentId);
    else if (isMarkAgentUnreadAction(action)) onSetAgentUnread?.(agentId, markAgentUnreadValue(action));
    else if (isHideFromSidebarAction(action)) onHideFromSidebar(agentId);
    else if (isDeleteAgentAction(action)) onRequestDelete?.({ id: agentId, name: agentName, isGroup });
  };
  const actionItem = (action: AgentRowAction) => menuItem(action.id, action.label, iconForAction(action), select(() => runAction(action)), isDeleteAgentAction(action) ? "danger" : undefined);
  const moveItem = !canMoveToSection ? null : sections != null && sections.length > 0
    ? <SandMenuRoot closeOnSelect={false} key="move" onOpenChange={setMoveMenuOpen} open={moveMenuOpen} placement="right-start">
      <SandMenuTrigger><SandButton aria-expanded={moveMenuOpen} aria-haspopup="menu" leadingIcon="folder-plus" role="menuitem" size="md" variant="secondary">{sectionLabel}</SandButton></SandMenuTrigger>
      <SandMenuContent ariaLabel="Move to section">
        {onMoveToSection == null ? null : sections.map((section, index) => <SandMenuItem index={index} key={section.id} onSelect={() => { closeMenu(); onMoveToSection(section.id); }}>{section.name}</SandMenuItem>)}
        {onMoveToNewSection == null ? null : <SandMenuItem index={sections.length} onSelect={() => { closeMenu(); onMoveToNewSection(); }}>New section</SandMenuItem>}
      </SandMenuContent>
    </SandMenuRoot>
    : menuItem("move-new-section", "Move to new section", "folder-plus", select(() => onMoveToNewSection?.()));
  // Grouped like the shipped Grok Bot menu: organise · edit · copy · remove, separated by rules.
  const groups: ReactNode[][] = [
    [...actions.filter(isTogglePinAction).map(actionItem), moveItem, ...actions.filter(isMarkAgentUnreadAction).map(actionItem)],
    [
      onOpenProfile == null ? null : menuItem("edit-profile", "Edit Profile", "pencil", select(() => onOpenProfile(agentId))),
      ...actions.filter(isDuplicateAgentAction).map(actionItem),
      onShowFullConversation == null ? null : menuItem("show-full-conversation", "Show full conversation", "list-bullets", select(() => onShowFullConversation(agentId))),
      onShowAsyncTasks == null ? null : menuItem("show-async-tasks", "Show async tasks", "clock", select(() => onShowAsyncTasks(agentId))),
    ],
    actions.filter(isCopyConversationIdAction).map(actionItem),
    [...actions.filter(isHideFromSidebarAction).map(actionItem), ...actions.filter(isDeleteAgentAction).map(actionItem)],
  ];
  const content = <div className="ui-menu__list sand-agent-menu" data-component="menu-list">{withSeparators(groups)}</div>;

  return <SandContextMenu ariaLabel={AGENT_ROW_ACTIONS_LABEL} content={content} onOpenChange={(next) => { setMenu(next); if (next == null) setMoveMenuOpen(false); }} open={menu}>
    <div onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}>
      {children}
    </div>
  </SandContextMenu>;
}
