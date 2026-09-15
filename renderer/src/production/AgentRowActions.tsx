import { t } from "./locale";
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import { SandContextMenu } from "../recovered/ui/sand-floating-primitives";
import {
  AGENT_ROW_ACTIONS_LABEL,
  type AgentRowAction,
  agentRowActions,
  isDeleteAgentAction,
  isTogglePinAction,
  togglePinValue
} from "./agent-row-actions-model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L51965
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2345000
// herdr-bot: the sidebar row's right-click menu, after the Grok Bot reference --
//   [고정 / 고정 해제]  |  [Bot 이름 변경, 프로필 편집]  |  [삭제]
// The recovered move-to-section submenu, mark-as-unread, duplicate, copy-conversation-id,
// show-full-conversation and show-async-tasks items were removed from the menu outright.

export interface AgentRowActionsProps {
  agentId: string;
  agentName: string;
  isGroup?: boolean;
  isPinned?: boolean;
  onTogglePin?(agentId: string, isPinned: boolean): void;
  /** Puts the row's name into its inline editor (the same editor double-click opens). */
  onStartRename?(): void;
  /** Opens the bot's chat with the right-hand settings pane already open. */
  onOpenProfile?(agentId: string): void;
  onRequestDelete?(agent: { id: string; name: string; isGroup?: boolean }): void;
  children: ReactNode;
}

type MenuIcon = "pin" | "pin-slash" | "trash" | "pencil" | "pencil-square";

function iconForAction(action: AgentRowAction): MenuIcon {
  if (isTogglePinAction(action)) return togglePinValue(action) ? "pin" : "pin-slash";
  return "trash";
}

function menuItem(key: string, label: string, icon: MenuIcon, onClick: () => void, sentiment?: "danger"): ReactNode {
  return <SandButton key={key} leadingIcon={icon} onClick={onClick} role="menuitem" sentiment={sentiment} size="md" variant="secondary">{label}</SandButton>;
}

/** Drops empty groups and puts a rule between the survivors. */
function withSeparators(groups: readonly (readonly ReactNode[])[]): ReactNode[] {
  const present = groups.map((group) => group.filter((node) => node != null)).filter((group) => group.length > 0);
  return present.flatMap((group, index) => index === 0 ? group : [<div aria-hidden="true" className="sand-agent-menu__separator" key={`separator-${index}`} role="separator" />, ...group]);
}

export function AgentRowActions({ agentId, agentName, isPinned = false, isGroup, onTogglePin, onStartRename, onOpenProfile, onRequestDelete, children }: AgentRowActionsProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const actions = agentRowActions({ isPinned, includeDelete: onRequestDelete != null, includePin: onTogglePin != null });
  const hasItems = actions.length > 0 || onStartRename != null || onOpenProfile != null;

  const openAt = (x: number, y: number) => {
    if (!hasItems) return;
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

  const closeMenu = () => setMenu(null);
  const select = (run: () => void) => () => { closeMenu(); run(); };
  // Closing the menu returns focus to whatever was focused when it opened (sand-floating-primitives
  // useDismissal, returnFocus) from an effect cleanup. AgentNameEditor treats blur as "commit and
  // exit", so that restore must land BEFORE the editor's own mount focus(). React already orders
  // passive cleanups before passive mounts within one commit; the one-frame deferral makes that
  // ordering independent of how the two state updates get batched, at the cost of ~16ms.
  const startRename = onStartRename == null ? undefined : () => { closeMenu(); requestAnimationFrame(onStartRename); };
  const runAction = (action: AgentRowAction) => {
    if (isTogglePinAction(action)) onTogglePin?.(agentId, togglePinValue(action));
    else if (isDeleteAgentAction(action)) onRequestDelete?.({ id: agentId, name: agentName, isGroup });
  };
  const actionItem = (action: AgentRowAction) => menuItem(action.id, t(action.label), iconForAction(action), select(() => runAction(action)), isDeleteAgentAction(action) ? "danger" : undefined);
  const renameLabel = isGroup === true ? t("Rename group", "그룹 이름 변경") : t("Rename Bot", "Bot 이름 변경");
  const groups: ReactNode[][] = [
    actions.filter(isTogglePinAction).map(actionItem),
    [
      startRename == null ? null : menuItem("rename", renameLabel, "pencil-square", startRename),
      onOpenProfile == null ? null : menuItem("edit-profile", t("Edit Profile", "프로필 편집"), "pencil", select(() => onOpenProfile(agentId)))
    ],
    actions.filter(isDeleteAgentAction).map(actionItem)
  ];
  const content = <div className="ui-menu__list sand-agent-menu" data-component="menu-list">{withSeparators(groups)}</div>;

  return <SandContextMenu ariaLabel={AGENT_ROW_ACTIONS_LABEL} content={content} onOpenChange={setMenu} open={menu}>
    <div onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}>
      {children}
    </div>
  </SandContextMenu>;
}
