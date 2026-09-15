// Narrow agent-row action tranche recovered from udn/fcn/ccn.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L50271
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L51965
// herdr-bot: trimmed to the Grok Bot row menu -- 고정/고정 해제 · (rename, edit profile) · 삭제. The
// copy-conversation-id, duplicate and mark-read/unread actions were dropped from the menu outright;
// rename and edit-profile are not toggles, so AgentRowActions.tsx renders them directly.

export const AGENT_ROW_ACTIONS_LABEL = "Agent actions";

export interface AgentRowAction {
  id: "pin-agent" | "unpin-agent" | "delete-agent";
  label: "Pin" | "Unpin" | "Delete";
}

const PIN_AGENT_ACTION: AgentRowAction = {
  id: "pin-agent",
  label: "Pin"
};
const UNPIN_AGENT_ACTION: AgentRowAction = {
  id: "unpin-agent",
  label: "Unpin"
};
const DELETE_AGENT_ACTION: AgentRowAction = {
  id: "delete-agent",
  label: "Delete"
};

export function agentRowActions({ isPinned = false, includeDelete = false, includePin = false }: { isPinned?: boolean; includeDelete?: boolean; includePin?: boolean }): readonly AgentRowAction[] {
  return [
    ...(includePin ? [isPinned ? UNPIN_AGENT_ACTION : PIN_AGENT_ACTION] : []),
    ...(includeDelete ? [DELETE_AGENT_ACTION] : [])
  ];
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
