import type { CSSProperties } from "react";
import { resolvePersonaColorHex } from "../../onboarding/signed-in/character";
import { AgentAvatar } from "./agent-avatar";

export interface MentionIdentity {
  readonly color: string | null;
  readonly shape: string | null;
  readonly dataUrl: string | null;
}

export function MentionChip({ id, label, identity }: {
  readonly id: string;
  readonly label: string;
  readonly identity: MentionIdentity | null;
}) {
  const color = identity?.color ?? null;
  return <span className="sand-mention" data-type="mention" style={{ "--mention-color": resolvePersonaColorHex(id, color) } as CSSProperties}>
    <AgentAvatar agentId={id} color={color ?? undefined} dataUrl={identity?.dataUrl ?? undefined} isStatic shape={identity?.shape ?? undefined} size="xs" />
    <span>@{label}</span>
  </span>;
}
