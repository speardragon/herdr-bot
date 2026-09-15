import { AgentAvatar, type AgentAvatarSize } from "../../conversation/workspace/agent-avatar";
import { t } from "../../../../production/locale";
import { groupHeroLayout } from "../../../../production/group-hero-layout";

// herdr-bot: the group settings hero after the Grok Bot reference (A) -- the user's own bubble sits
// top-centre with the member avatars clustered underneath it. Grok shows the signed-in profile
// photo there; herdr-bot has no user profile, so the bubble is a plain circle reading "나"/"Me".
// This is deliberately NOT the generic GroupAvatar composite (agent-avatar.tsx): that one renders
// at 16-28px in the sidebar and chat header, where a text bubble was unreadable at those sizes --
// `size="sm"` below is this same self+members cluster scaled down for the sidebar, now that the
// sidebar avatar itself has grown large enough (44px) to fit it legibly. A pinned sidebar tile
// reuses the full 72px `xl` cluster unchanged, so pinned groups match the settings hero exactly.
//
// From 3 members the cluster becomes a 2x2 grid instead (Grok reference: the user's bubble top-left,
// members filling the remaining cells row-major, and a text "+N" in the last cell once there are
// more than three). group-hero-layout.ts owns those tiers; this component only renders them.

export interface GroupHeroMember {
  readonly id: string;
  readonly name: string;
  readonly dataUrl?: string | null;
  readonly shape?: string | null;
  readonly color?: string | null;
}

export interface GroupHeroAvatarProps {
  readonly members: readonly GroupHeroMember[];
  /** "xl" (default): the 72px group-settings hero and pinned sidebar tile. "sm": the 44px sidebar row. */
  readonly size?: "xl" | "sm";
}

const MEMBER_AVATAR_SIZE: Record<"xl" | "sm", AgentAvatarSize> = { xl: "lg", sm: "sm" };

export function GroupHeroAvatar({ members, size = "xl" }: GroupHeroAvatarProps) {
  const { layout, visibleCount, overflow } = groupHeroLayout(members.length);
  const visible = members.slice(0, visibleCount);
  return <span aria-hidden="true" className={size === "sm" ? "sand-group-hero sand-group-hero--sm" : "sand-group-hero"} data-layout={layout} data-member-count={members.length}>
    <span className="sand-group-hero__self">{t("Me", "나")}</span>
    <span className="sand-group-hero__members">
      {visible.map((member) => <span className="sand-group-hero__member" key={member.id}>
        <AgentAvatar agentId={member.id} color={member.color} dataUrl={member.dataUrl} isStatic name={member.name} shape={member.shape} size={MEMBER_AVATAR_SIZE[size]} />
      </span>)}
      {overflow > 0 ? <span className="sand-group-hero__member sand-group-hero__overflow">+{overflow}</span> : null}
    </span>
  </span>;
}
