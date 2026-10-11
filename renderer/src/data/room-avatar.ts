/**
 * Pure selection logic for a room's stacked-member avatar: a tiny stacked cluster of up to 3 member
 * mascots, with a "+N" badge overlapping the bottom-left corner when the room has more members than
 * fit. Kept separate from the Avatar component so the picking rule is
 * unit-testable without rendering anything.
 */
import type { ChatSummary } from "./types.ts";

const MAX_STACKED = 3;
/** When a room has more members than fit, only this many mascots are drawn before the "+N" badge. */
const SHOWN_WITH_OVERFLOW = 2;

export interface StackedAvatarPlan {
  readonly shown: readonly ChatSummary[];
  readonly overflowCount: number;
}

export function planStackedAvatar(members: readonly ChatSummary[]): StackedAvatarPlan {
  if (members.length <= MAX_STACKED) return { shown: members, overflowCount: 0 };
  return { shown: members.slice(0, SHOWN_WITH_OVERFLOW), overflowCount: members.length - SHOWN_WITH_OVERFLOW };
}
