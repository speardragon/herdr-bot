/** herdr-bot (Task 5, plan chat-interaction-polish): pure model for the header-based "new chat"
 * combobox -- draft membership toggling, option-list composition, the default group name, and the
 * keyboard-navigation active-index math. Kept dependency-free (no React/DOM) so it is testable
 * without a browser harness; NewChatHeader.tsx only renders what these functions compute. */

export interface NewChatDraft {
  requestId: string;
  mode: "choose" | "group";
  query: string;
  memberIds: readonly string[];
}

const GROUP_MAX_MEMBERS = 6;
const GROUP_NAME_MAX_LENGTH = 40;

export function createNewChatDraft(requestId: string): NewChatDraft {
  return { requestId, mode: "choose", query: "", memberIds: [] };
}

/** "+" pressed while a draft already exists must not create a second one -- returns `current`
 * unchanged when it is non-null, and only calls createNewChatDraft when there is none yet. */
export function startDraft(current: NewChatDraft | null, requestId: string): NewChatDraft {
  return current ?? createNewChatDraft(requestId);
}

export function addDraftMember(draft: NewChatDraft, id: string): NewChatDraft {
  if (draft.memberIds.includes(id) || draft.memberIds.length >= GROUP_MAX_MEMBERS) return draft;
  return { ...draft, memberIds: [...draft.memberIds, id], query: "" };
}

export function removeDraftMember(draft: NewChatDraft, id: string): NewChatDraft {
  return { ...draft, memberIds: draft.memberIds.filter(memberId => memberId !== id) };
}

export function canCreateGroup(draft: NewChatDraft): boolean {
  return draft.mode === "group" && draft.memberIds.length >= 2 && draft.memberIds.length <= GROUP_MAX_MEMBERS;
}

export interface NewChatCandidateBot {
  readonly id: string;
  readonly name: string;
  /** Present when the bot is a quick-created reservation still being provisioned; `undefined`/`null`
   * onboarding, or a "ready" stage, means the bot is a normal, joinable candidate. */
  readonly onboardingStage?: string | null;
}

export type NewChatOption<TBot extends NewChatCandidateBot = NewChatCandidateBot> =
  | { readonly kind: "bot"; readonly bot: TBot }
  | { readonly kind: "create-bot" }
  | { readonly kind: "create-group" };

function isJoinable(bot: NewChatCandidateBot): boolean {
  return bot.onboardingStage == null || bot.onboardingStage === "ready";
}

function matchesQuery(name: string, query: string): boolean {
  return query.trim().length === 0 || name.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Composes the header's dropdown option list. "choose" mode: an empty query surfaces just the two
 * create actions; a non-empty query also surfaces matching existing bots. "group" mode searches
 * member candidates only (no create actions), excluding already-selected members and bots that are
 * not yet joinable (still provisioning or failed setup) -- the host would reject them at submit
 * anyway, so they are never offered as a candidate.
 */
export function buildOptionList<TBot extends NewChatCandidateBot>(draft: NewChatDraft, candidates: readonly TBot[]): readonly NewChatOption<TBot>[] {
  if (draft.mode === "group") {
    const selected = new Set(draft.memberIds);
    return candidates
      .filter(bot => !selected.has(bot.id) && isJoinable(bot) && matchesQuery(bot.name, draft.query))
      .map(bot => ({ kind: "bot" as const, bot }));
  }
  const matches = draft.query.trim().length === 0 ? [] : candidates.filter(bot => matchesQuery(bot.name, draft.query));
  return [...matches.map(bot => ({ kind: "bot" as const, bot })), { kind: "create-bot" as const }, { kind: "create-group" as const }];
}

/** `selectedBots`, in `draft.memberIds` order, for rendering chips ahead of the input. */
export function selectedMembers<TBot extends NewChatCandidateBot>(draft: NewChatDraft, candidates: readonly TBot[]): readonly TBot[] {
  const byId = new Map(candidates.map(bot => [bot.id, bot] as const));
  return draft.memberIds.flatMap(id => { const bot = byId.get(id); return bot == null ? [] : [bot]; });
}

/**
 * Drops any `memberIds` entry that is no longer a valid candidate -- deleted since it was selected,
 * or whose onboarding regressed away from "ready" -- so the header can show the surviving chips and
 * an explanatory error instead of submitting a group the host will reject anyway (plan: "삭제되거나
 * 준비 중인 멤버는 submit 직전 host에서 거부하고 UI에서 제거 안내한다").
 */
export function pruneDraftMembers<TBot extends NewChatCandidateBot>(draft: NewChatDraft, candidates: readonly TBot[]): NewChatDraft {
  const joinable = new Set(candidates.filter(isJoinable).map(bot => bot.id));
  const kept = draft.memberIds.filter(id => joinable.has(id));
  return kept.length === draft.memberIds.length ? draft : { ...draft, memberIds: kept };
}

/** Default group name: the selected bots' names in selection order, joined with ", ", truncated to
 * at most 40 characters with a trailing ellipsis. */
export function defaultGroupName(selected: readonly NewChatCandidateBot[]): string {
  const joined = selected.map(bot => bot.name).join(", ");
  if (joined.length <= GROUP_NAME_MAX_LENGTH) return joined;
  return `${joined.slice(0, GROUP_NAME_MAX_LENGTH - 1)}…`;
}

export type ActiveIndexDirection = "up" | "down";

/** Moves the dropdown's active-option index, clamping at the ends (no wraparound) -- ArrowUp/Down
 * never leave the option list, and an empty list has no active index. */
export function moveActiveIndex(current: number | null, optionCount: number, direction: ActiveIndexDirection): number | null {
  if (optionCount === 0) return null;
  const base = current ?? (direction === "down" ? -1 : optionCount);
  const next = direction === "down" ? base + 1 : base - 1;
  return Math.min(optionCount - 1, Math.max(0, next));
}

/** The option Enter would select, or null if there is none (empty list, or the index is stale). */
export function activeOption<T>(options: readonly T[], activeIndex: number | null): T | null {
  return activeIndex != null && activeIndex >= 0 && activeIndex < options.length ? options[activeIndex] : null;
}

/** Enter must be ignored while an IME composition is in progress (Korean/Japanese/Chinese input),
 * so committing a composed syllable does not also submit the combobox. */
export function shouldSelectOnEnter(event: { readonly isComposing?: boolean; readonly keyCode?: number }): boolean {
  return event.isComposing !== true && event.keyCode !== 229;
}
