import { isLocalGroupAgent, type RendererAgent } from "../../../../production/model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2298141 (cct local-group gate)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2915342 (Windows cct local-group gate)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2776318 (p3n info-pane overview route)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3531074 (Windows p3n info-pane overview route)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2787792 (Conversation details header)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3545411 (Windows Conversation details header)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2733875 (Members section mount)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3477867 (Windows Members section mount)

export const GROUP_INFO_PANE_ROUTE = "overview" as const;
export const GROUP_INFO_PANE_HEADER = {
  ariaLabel: "Conversation details",
  closeLabel: "Close details",
  sectionLabel: "Members"
} as const;

export interface GroupInfoPaneRoute {
  readonly route: typeof GROUP_INFO_PANE_ROUTE;
  readonly agentId: string;
  readonly accountKey: string;
  readonly accountGeneration: number;
  readonly header: typeof GROUP_INFO_PANE_HEADER;
  readonly onOpenAgentChat: (agentId: string) => void;
}

export interface GroupInfoPaneRouteInput {
  readonly agent: Pick<RendererAgent, "id" | "isGroup" | "raw"> | null;
  readonly accountKey: string | null;
  readonly accountGeneration: number;
  readonly onOpenAgentChat: (agentId: string) => void;
}

/**
 * Projects the unmounted group-details contract. The route is overview-only;
 * shared rooms and unsigned/stale scopes fail closed before any member UI can mount.
 */
export function projectGroupInfoPaneRoute(input: GroupInfoPaneRouteInput): GroupInfoPaneRoute | null {
  const { agent, accountKey, accountGeneration, onOpenAgentChat } = input;
  if (agent == null || !isLocalGroupAgent(agent) || agent.id.length === 0) return null;
  if (accountKey == null || accountKey.length === 0 || !Number.isInteger(accountGeneration) || accountGeneration < 0) return null;
  return {
    route: GROUP_INFO_PANE_ROUTE,
    agentId: agent.id,
    accountKey,
    accountGeneration,
    header: GROUP_INFO_PANE_HEADER,
    onOpenAgentChat
  };
}

export function isCurrentGroupInfoPaneRoute(
  route: GroupInfoPaneRoute | null,
  scope: Pick<GroupInfoPaneRouteInput, "agent" | "accountKey" | "accountGeneration">
): boolean {
  return route != null
    && scope.agent != null
    && route.agentId === scope.agent.id
    && route.accountKey === scope.accountKey
    && route.accountGeneration === scope.accountGeneration
    && isLocalGroupAgent(scope.agent);
}
