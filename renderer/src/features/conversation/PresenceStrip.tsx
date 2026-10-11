import { personaColorVar, resolvePersonaColor } from "../../data/avatar-colors.ts";
import { statusPhraseKind } from "../../data/status.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Avatar } from "../../primitives/index.ts";
import type { ChatSummary } from "../../data/types.ts";
import type { PresenceMember } from "../../data/status.ts";
import styles from "./ConversationSlot.module.css";

export interface PresenceStripProps {
  readonly members: readonly ChatSummary[];
  readonly presence: readonly PresenceMember[];
}

/** The room-only second header row: small member avatars with a per-member status *ring*,
 * then a compact sentence-case status line joining every non-idle member with " · " (the *full* list,
 * both working and needs-approval -- unlike the header's own subtitle, which only ever surfaces working
 * members, see header-status.ts's module doc).
 *
 * The ring is its own visual language: it is drawn in *that member's own
 * persona color* (not a universal red/orange semantic color), dashed for needs-approval and solid for
 * working -- distinct from `Avatar`'s corner `statusDot` badge, which this presence strip does not use. */
export function PresenceStrip({ members, presence }: PresenceStripProps) {
  const { t } = useT();
  return (
    <div className={styles["hb-conversation-presence"]}>
      {members.map((member) => {
        const color = resolvePersonaColor(member.avatarColor);
        const phrase = statusPhraseKind(member);
        const ring = phrase === "needsApproval" ? "dashed" : phrase === "working" ? "solid" : "none";
        return (
          <span key={member.id} className={styles["hb-conversation-presence-avatar"]} style={{ borderColor: ring === "none" ? "transparent" : personaColorVar(color), borderStyle: ring }}>
            <Avatar kind="bot" color={color} name={member.name} size="xs" />
          </span>
        );
      })}
      {presence.length > 0 && (
        <span className={styles["hb-conversation-presence-text"]}>
          {presence.map((member) => t(`conversation.status.${member.phrase === "needsApproval" ? "needsApproval" : "working"}`, { name: member.name })).join(" · ")}
        </span>
      )}
    </div>
  );
}
