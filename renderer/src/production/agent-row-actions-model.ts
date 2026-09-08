// Narrow agent-row action tranche recovered from udn/fcn/ccn.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L50271
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L51965

export const AGENT_ROW_ACTIONS_LABEL = "Agent actions";

export interface AgentRowAction {
  id: "pin-agent" | "unpin-agent" | "hide-from-sidebar" | "delete-agent" | "copy-conversation-id" | "duplicate-agent" | "mark-read" | "mark-unread";
  label: "Pin" | "Unpin" | "Hide from sidebar" | "Delete" | "Copy conversation ID" | "Duplicate" | "Mark as Read" | "Mark as Unread";
}

const PIN_AGENT_ACTION: AgentRowAction = {
  id: "pin-agent",
  label: "Pin"
};
const UNPIN_AGENT_ACTION: AgentRowAction = {
  id: "unpin-agent",
  label: "Unpin"
};
const HIDE_FROM_SIDEBAR_ACTION: AgentRowAction = {
  id: "hide-from-sidebar",
  label: "Hide from sidebar"
};
const DELETE_AGENT_ACTION: AgentRowAction = {
  id: "delete-agent",
  label: "Delete"
};
const COPY_CONVERSATION_ID_ACTION: AgentRowAction = {
  id: "copy-conversation-id",
  label: "Copy conversation ID"
};
const DUPLICATE_AGENT_ACTION: AgentRowAction = {
  id: "duplicate-agent",
  label: "Duplicate"
};
const MARK_READ_ACTION: AgentRowAction = {
  id: "mark-read",
  label: "Mark as Read"
};
const MARK_UNREAD_ACTION: AgentRowAction = {
  id: "mark-unread",
  label: "Mark as Unread"
};

export function agentRowActions({ isHidden, isPinned = false, hasUnread = false, includeCopy = false, includeDelete = false, includeDuplicate = false, includeMarkUnread = false, includePin = false }: { isHidden: boolean; isPinned?: boolean; hasUnread?: boolean; includeCopy?: boolean; includeDelete?: boolean; includeDuplicate?: boolean; includeMarkUnread?: boolean; includePin?: boolean }): readonly AgentRowAction[] {
  if (isHidden) return [];
  return [
    ...(includePin ? [isPinned ? UNPIN_AGENT_ACTION : PIN_AGENT_ACTION] : []),
    ...(includeMarkUnread ? [hasUnread ? MARK_READ_ACTION : MARK_UNREAD_ACTION] : []),
    ...(includeDuplicate ? [DUPLICATE_AGENT_ACTION] : []),
    ...(includeCopy ? [COPY_CONVERSATION_ID_ACTION] : []),
    HIDE_FROM_SIDEBAR_ACTION,
    ...(includeDelete ? [DELETE_AGENT_ACTION] : [])
  ];
}

export function isHideFromSidebarAction(action: AgentRowAction): boolean {
  return action.id === "hide-from-sidebar";
}

export function isTogglePinAction(action: AgentRowAction): boolean {
  return action.id === "pin-agent" || action.id === "unpin-agent";
}

export function togglePinValue(action: AgentRowAction): boolean {
  return action.id === "pin-agent";
}

export function isDeleteAgentAction(action: AgentRowAction): boolean {
  return action.id === "delete-agent";
}

export function isCopyConversationIdAction(action: AgentRowAction): boolean {
  return action.id === "copy-conversation-id";
}

export function isDuplicateAgentAction(action: AgentRowAction): boolean {
  return action.id === "duplicate-agent";
}

export function isMarkAgentUnreadAction(action: AgentRowAction): boolean {
  return action.id === "mark-read" || action.id === "mark-unread";
}

export function markAgentUnreadValue(action: AgentRowAction): boolean {
  return action.id === "mark-unread";
}
