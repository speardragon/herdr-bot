// herdr-bot: the avatar editor's controller (avatar-editor/controller.ts) persists a colour/shape
// pick straight to the coordinator without touching the renderer's `agents` list, so nothing else on
// screen -- sidebar rows, pinned tiles, the settings hero itself -- would reflect a pick until the
// next full roster refresh. ProductionRenderer watches the controller and, once its persisted
// character or hasExistingAvatar actually changes (i.e. the RPC succeeded), mirrors that one field
// into `agents` with these two pure functions.

export interface AvatarCharacterAgent {
  readonly id: string;
  readonly avatarColor?: string | null;
  readonly avatarShape?: string | null;
  readonly avatarDataUrl?: string | null;
}

export interface AvatarCharacterSnapshot {
  readonly avatarColor: string | null;
  readonly avatarShape: string | null;
  readonly hasExistingAvatar: boolean;
}

export function avatarCharacterChanged(previous: AvatarCharacterSnapshot, next: AvatarCharacterSnapshot): boolean {
  return previous.avatarColor !== next.avatarColor
    || previous.avatarShape !== next.avatarShape
    || previous.hasExistingAvatar !== next.hasExistingAvatar;
}

/** Committing a colour/shape pick always clears any saved photo (avatar-editor/controller.ts
 * commitStagedCharacter), so `avatarDataUrl` is nulled whenever hasExistingAvatar goes false, and
 * left alone otherwise. Agents other than agentId are returned by the same reference. */
export function applyAvatarCharacter<T extends AvatarCharacterAgent>(
  agents: readonly T[],
  agentId: string,
  next: AvatarCharacterSnapshot,
): T[] {
  return agents.map((agent) => agent.id === agentId ? {
    ...agent,
    avatarColor: next.avatarColor,
    avatarShape: next.avatarShape,
    avatarDataUrl: next.hasExistingAvatar ? agent.avatarDataUrl : null,
  } : agent);
}
