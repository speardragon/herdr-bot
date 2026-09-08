// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2357992
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5487865

/**
 * The shipped Agent network trigger is a synchronous navigation seam: when
 * the org-chart entrypoint is available, close the current chooser and open
 * the workspace route. The root owns account and roster state; this adapter
 * deliberately carries no account data or asynchronous work.
 */
export interface AgentNetworkTriggerActions {
  readonly isAvailable: boolean;
  closeChooser(): void;
  openOrgChart(): void;
}

export const AGENT_NETWORK_TRIGGER = {
  ariaLabel: "Agent network",
  className: "sand-agents-sidebar__network",
  icon: "cube-nodes",
} as const;

export type AgentNetworkTrigger = () => boolean;

export function createAgentNetworkTrigger(actions: AgentNetworkTriggerActions): AgentNetworkTrigger {
  return () => {
    if (!actions.isAvailable) return false;
    actions.closeChooser();
    actions.openOrgChart();
    return true;
  };
}
