import type { CSSProperties } from "react";
import { resolvePersonaColorHex } from "../../onboarding/signed-in/character";
import { AgentAvatar } from "./agent-avatar";
import { EVERYONE_ID } from "./editor-suggestion-provider";

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
    {id === EVERYONE_ID
      ? <AgentAvatar agentId={id} isStatic kind="everyone" size="xs" />
      : <AgentAvatar agentId={id} color={color ?? undefined} dataUrl={identity?.dataUrl ?? undefined} isStatic shape={identity?.shape ?? undefined} size="xs" />}
    <span>@{label}</span>
  </span>;
}
