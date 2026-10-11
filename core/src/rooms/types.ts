/** A room/DM member's identity as the turn-taking logic sees it -- id plus the profile fields that
 * feed mention handles, keyword-fit ordering, and the per-turn prompt restatement. */
export interface RoomMember {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly title?: string;
}

/** Who said a given transcript entry: the human user (optionally carrying a display name), or a
 * specific member (always carrying its id and the name it had at the time it spoke). */
export type MessageSpeaker = { readonly kind: "user"; readonly name?: string } | { readonly kind: "member"; readonly id: string; readonly name: string };

/** One transcript entry as this logic needs it. `id` is optional -- plenty of call sites (prompt
 * fixtures, "new since last spoke" slices) never need it, only the (chat, member)-scoped bookkeeping
 * that lives outside this module (SayInbox, held markers) does. */
export interface RoomMessage {
  readonly id?: string;
  readonly speaker: MessageSpeaker;
  readonly content: string;
}

/** Every member turn concludes with exactly one of these. */
export type TurnOutcome = "settled" | "busy" | "blocked" | "stalled" | "timeout" | "offline" | "error";

/** What running one member's turn produces: its outcome, plus whatever it actually said (possibly
 * empty -- a "settled" turn may have nothing to add, and the one non-settled outcome that always
 * carries zero messages is "busy"). */
export interface MemberTurnResult {
  readonly outcome: TurnOutcome;
  readonly spoken: readonly string[];
}

/** The result of a cheap, non-blocking "is this member busy elsewhere right now" peek. */
export type Availability = "available" | "busy";

/** Handed to the caller's `runMemberTurn` for one dispatched turn. `round` is passed through only
 * for whatever use the caller wants to make of it -- the cycle runner itself never reads it back. */
export interface RunMemberTurnArgs {
  readonly member: RoomMember;
  readonly peers: readonly RoomMember[];
  readonly newMessages: readonly RoomMessage[];
  readonly round: number;
}

/**
 * The capabilities {@link RoomCycleRunner} needs from its caller. None of these are provided BY this
 * module -- they are how the cycle runner reaches back into the host (roster lookups, transcript
 * storage, epoch bookkeeping, actually running a member's turn).
 */
export interface RoomCycleCapabilities {
  /** Looks up the current roster for a given list of member ids; ids that no longer resolve are
   * dropped (never throws, never pads with nulls). */
  readonly resolveMembers: (ids: readonly string[]) => Promise<RoomMember[]>;
  /** Reads the chat's entire transcript, fresh, at this exact moment. */
  readonly readHistory: () => readonly RoomMessage[];
  /** Is this cycle-run still the authoritative one for its chat? See "Cancellation / epochs". */
  readonly isCurrent: () => boolean;
  /** Actually runs one member's turn and resolves with its outcome and whatever it said. */
  readonly runMemberTurn: (args: RunMemberTurnArgs) => Promise<MemberTurnResult>;
  /** Optional cheap, non-blocking busy check (see "Skipping busy members"). Omitted means every
   * member is always treated as available. */
  readonly peekAvailability?: (memberId: string) => Availability;
  /** Optional callback fired once a member's turn concludes (including a round-level busy skip),
   * for the caller's own side effects (notices, held-question marking). Never consulted by the
   * cycle runner's own logic. */
  readonly onMemberTurnEnded?: (member: RoomMember, result: MemberTurnResult) => void;
}

/** Tunable limits for one cycle; both default to the constants in constants.ts when omitted. */
export interface RoomCycleOptions {
  readonly maxRounds?: number;
  readonly maxSpokenMessages?: number;
}
