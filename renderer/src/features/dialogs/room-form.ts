/**
 * Pure validation + member-cap logic for the New Room form (a live N/6 counter -- the
 * member cap is 6, enforced live in this picker) and for room info's member-management editor
 * (the same cap applies when editing via `room.setMembers`, reusing this module). No DOM/React so it's
 * directly unit-testable.
 */

export const MAX_ROOM_MEMBERS = 6;

/** Whether `memberId` can be toggled on/off given the current selection -- always allowed to uncheck;
 * checking a new box is blocked once the cap is reached (can't check a 7th box). */
export function canToggleMember(selected: readonly string[], memberId: string, max: number = MAX_ROOM_MEMBERS): boolean {
  if (selected.includes(memberId)) return true;
  return selected.length < max;
}

export function toggleMember(selected: readonly string[], memberId: string, max: number = MAX_ROOM_MEMBERS): readonly string[] {
  if (selected.includes(memberId)) return selected.filter((id) => id !== memberId);
  if (selected.length >= max) return selected;
  return [...selected, memberId];
}

export interface RoomFormState {
  readonly name: string;
  readonly goal: string;
  readonly memberIds: readonly string[];
}

export interface RoomFormValidation {
  readonly nameError: "required" | null;
  readonly memberError: "required" | null;
  readonly canSubmit: boolean;
}

/** `bot.create`'s cap-related error is `too_many_members`; this mirrors the cap client-side so the
 * form never lets a user compose a request that would hit it with the live counter. Requires at
 * least one member, by design -- a 0-member room
 * has nothing to talk to (see this folder's README "Known gaps"). */
export function validateRoomForm(state: RoomFormState, max: number = MAX_ROOM_MEMBERS): RoomFormValidation {
  const nameError = state.name.trim().length === 0 ? "required" : null;
  const memberError = state.memberIds.length === 0 ? "required" : null;
  return {
    nameError,
    memberError,
    canSubmit: nameError == null && memberError == null && state.memberIds.length <= max,
  };
}
