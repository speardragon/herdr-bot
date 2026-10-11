/**
 * @-mention autocomplete candidate list: pure selection/filtering logic, no editor/DOM involved so it's
 * unit-testable directly. Order is Everyone (people-group icon) first, then every other member of the
 * current chat by name with their mascot avatar, in the chat's member order -- not alphabetical.
 *
 * There is no host RPC for this -- the list is built client-side from `listAgents()`/room `memberIds`.
 * "Everyone" is a UI-synthesized pseudo-mention, never a real chat member.
 *
 * A bot 1:1 DM has no `memberIds` at all, so there is nothing to mention and no reason to offer
 * "Everyone" in a chat with a single other participant -- callers should only wire the `@` suggestion
 * up for a room (`chat.kind === "room"` with a non-empty member list), never for a bot DM. This module
 * itself doesn't special-case that; it just returns `[]` for an empty `members` list, so the caller's
 * "don't even open the popover" decision stays in the component, not hidden in here.
 */

export const EVERYONE_MENTION_ID = "everyone";

export interface MentionMember {
  readonly id: string;
  readonly name: string;
  /** `ChatSummary.avatarColor` for the member's current mascot tint -- `null`/unrecognized falls back to
   * the default persona color when rendered (see `data/avatar-colors.ts`). */
  readonly avatarColor: string | null;
}

export interface MentionCandidate {
  readonly id: string;
  readonly label: string;
  readonly everyone: boolean;
  readonly avatarColor: string | null;
}

function everyoneCandidate(): MentionCandidate {
  return { id: EVERYONE_MENTION_ID, label: "Everyone", everyone: true, avatarColor: null };
}

/** Builds the full (unfiltered) candidate list for a room: Everyone, then members in their given order
 * (callers pass `useChatMembers(chat)`'s result, which is already room-membership order). */
export function buildMentionCandidates(members: readonly MentionMember[]): readonly MentionCandidate[] {
  if (members.length === 0) return [];
  return [everyoneCandidate(), ...members.map((member) => ({ id: member.id, label: member.name, everyone: false, avatarColor: member.avatarColor }))];
}

/** Live-filters the candidate list as the user keeps typing after `@`. Case-insensitive substring
 * match on the display label; "Everyone" matches either its own label or the literal word "everyone".
 * Order is preserved from `candidates` (Everyone-first, then member order) -- filtering never re-sorts
 * by match quality. */
export function filterMentionCandidates(candidates: readonly MentionCandidate[], query: string): readonly MentionCandidate[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return candidates;
  return candidates.filter((candidate) => candidate.label.toLowerCase().includes(needle) || (candidate.everyone && "everyone".includes(needle)));
}
