import type { ReactNode } from "react";
import type { RendererAgent } from "../../../../production/model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2305676 (ml avatar dispatcher; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2310158 (Sct status contract; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2313158 (nIe title-tag contract; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2402251 (Kun pinned marker; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2941025 (sand-avatar-status-dot; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2943466 (sand-agent-title-tag; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3059826 (sand-agent-item__pin-marker; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

export type AgentPreviewAvatarKind = "agent" | "group" | "shared-room";
export type AgentPreviewStatusMarker = "blocked" | "unread" | null;

export interface AgentPreviewAvatarProjection {
  readonly kind: AgentPreviewAvatarKind;
  readonly agentId: string;
  readonly size: "xs";
  readonly dataUrl: string | null;
  readonly shape: string | null;
  readonly color: string | null;
}

export interface AgentPreviewStatusProjection {
  readonly presence: "working" | null;
  readonly marker: AgentPreviewStatusMarker;
  readonly isTyping: boolean;
  readonly role: "status" | undefined;
  readonly ariaHidden: boolean;
  readonly ariaLabel: "Working" | "Needs attention" | "Unread activity" | undefined;
}

export interface AgentPreviewHeaderProjection {
  readonly avatar: AgentPreviewAvatarProjection;
  readonly status: AgentPreviewStatusProjection;
  readonly title: string | null;
  readonly isPinned: boolean;
}

export type AgentPreviewAgent = {
  readonly id: string;
  readonly name: string;
  readonly updatedAt?: number;
  readonly isGroup?: boolean;
  readonly isSharedRoom?: boolean;
  readonly raw?: Pick<RendererAgent["raw"], "isSharedRoom">;
  readonly title?: string;
  readonly avatarDataUrl?: string | null;
  readonly avatarShape?: string | null;
  readonly avatarColor?: string | null;
  readonly awaitingUserResponse?: unknown | null;
  readonly waitingReason?: string;
  readonly isComposingMessage?: boolean;
  readonly isRunning?: boolean;
  readonly hasUnread?: boolean;
  readonly isPinned?: boolean;
  readonly lastEntry?: RendererAgent["lastEntry"] | null;
};

function isSharedRoomAgent(agent: Pick<AgentPreviewAgent, "isSharedRoom" | "raw">): boolean {
  return agent.isSharedRoom === true || agent.raw?.isSharedRoom === true;
}

export function projectAgentPreviewHeader(agent: AgentPreviewAgent, isHostReachable: boolean, announceStatus = false): AgentPreviewHeaderProjection {
  const isTyping = agent.awaitingUserResponse == null && agent.isComposingMessage === true;
  const isWorking = agent.awaitingUserResponse == null && (agent.isRunning === true || isTyping);
  const marker: AgentPreviewStatusMarker = agent.awaitingUserResponse != null ? "blocked" : agent.hasUnread === true ? "unread" : null;
  const presence = isHostReachable && isWorking ? "working" : null;
  const statusLabel = presence != null ? "Working" : marker === "blocked" ? "Needs attention" : marker === "unread" ? "Unread activity" : undefined;
  const title = agent.isGroup === true || agent.title === undefined ? null : agent.title.trim() || null;
  const kind: AgentPreviewAvatarKind = isSharedRoomAgent(agent) ? "shared-room" : agent.isGroup === true ? "group" : "agent";
  return {
    avatar: {
      kind,
      agentId: agent.id,
      size: "xs",
      dataUrl: typeof agent.avatarDataUrl === "string" && agent.avatarDataUrl.length > 0 ? agent.avatarDataUrl : null,
      shape: agent.avatarShape ?? null,
      color: agent.avatarColor ?? null
    },
    status: {
      presence,
      marker,
      isTyping,
      role: announceStatus && (presence != null || marker != null) ? "status" : undefined,
      ariaHidden: !(announceStatus && (presence != null || marker != null)),
      ariaLabel: announceStatus ? statusLabel : undefined
    },
    title,
    isPinned: agent.isPinned === true
  };
}

export interface AgentPreviewHeaderProps {
  readonly agent: AgentPreviewAgent;
  readonly isHostReachable: boolean;
  readonly isPinned?: boolean;
  readonly renderAvatar?: (projection: AgentPreviewAvatarProjection) => ReactNode;
  readonly renderStatus?: (projection: AgentPreviewStatusProjection) => ReactNode;
  readonly renderPinnedIcon?: () => ReactNode;
  readonly announceStatus?: boolean;
}

export interface AgentPreviewPinProps {
  readonly renderIcon: () => ReactNode;
}

/**
 * Exact first-party pin wrapper from Kun. The private icon renderer remains a
 * required slot so this leaf never substitutes a different icon primitive.
 */
export function AgentPreviewPin({ renderIcon }: AgentPreviewPinProps) {
  return <span aria-label="Pinned" className="sand-agent-item__pin-marker">{renderIcon()}</span>;
}

/** Unmounted exact header structure; avatar/status/icon internals remain injected private primitives. */
export function AgentPreviewHeader({ agent, isHostReachable, isPinned, renderAvatar, renderStatus, renderPinnedIcon, announceStatus = false }: AgentPreviewHeaderProps) {
  const projected = projectAgentPreviewHeader(agent, isHostReachable, announceStatus);
  const projection = isPinned === undefined ? projected : { ...projected, isPinned };
  return <div className="sand-agent-hover-card__header">
      <span className="sand-agent-hover-card__identity">
      {renderAvatar == null && renderStatus == null ? null : <span>
        {renderAvatar?.(projection.avatar)}
        {renderStatus?.(projection.status)}
      </span>}
      <span className="sand-agent-hover-card__title">
        <span className="sand-agent-hover-card__name">{agent.name}</span>
        {projection.title == null ? null : <span className="sand-agent-title-tag">{projection.title}</span>}
        {projection.isPinned && renderPinnedIcon != null ? <AgentPreviewPin renderIcon={renderPinnedIcon} /> : null}
      </span>
    </span>
  </div>;
}
