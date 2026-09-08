export interface HiddenAgentSummary {
  id: string;
  name: string;
}

export interface HiddenChatsOverlayModel {
  hiddenAgents: readonly HiddenAgentSummary[];
  isOpen: boolean;
  onClose(): void;
  onOpenAgent(agentId: string): void;
  onUnhide(agentId: string): void;
}

export function hiddenChatNameId(agentId: string): string {
  return `sand-hidden-chat-${agentId}-name`;
}

export function hiddenChatsEmptyLabel(hiddenAgents: readonly HiddenAgentSummary[]): string | null {
  return hiddenAgents.length === 0 ? "No hidden bots" : null;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 5485420-5487146
// bRn/B: selecting a hidden bot closes the overlay before opening that agent.
export function openHiddenChat(onClose: () => void, onOpenAgent: (agentId: string) => void, agentId: string): void {
  onClose();
  onOpenAgent(agentId);
}
