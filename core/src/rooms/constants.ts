/** Upper bound on how many rounds one ROOM cycle may run before stopping regardless of remaining
 * eligible candidates. */
export const ROOM_MAX_ROUNDS = 3;

/** A DM's "roster" is just the one bot, so its caller always overrides to this -- one round is the
 * whole cycle. Exported for callers/tests that want the named constant rather than a bare `1`. */
export const DM_MAX_ROUNDS = 1;

/** Whole-cycle budget across every member and every round combined; enforced so it can never be
 * exceeded, checked both before starting any turn and right after each turn concludes. */
export const MAX_TOTAL_SPOKEN_MESSAGES = 10;

/** When rendering a member's "new since I last spoke" list into its prompt, only the most recent
 * this-many entries are shown; older ones are silently dropped (not summarized). */
export const PROMPT_HISTORY_TAIL = 24;

/** A member may successfully register at most this many separate spoken messages within one open
 * turn; a further attempt within the same still-open turn is rejected outright. */
export const MAX_MESSAGES_PER_TURN = 2;

/** Structural cap on room roster size, enforced when membership is assembled/edited -- unrelated to
 * per-cycle mechanics. */
export const MAX_ROOM_MEMBERS = 6;

/** A name-derived soft-mention handle shorter than this is never considered for a match. */
export const SOFT_MENTION_MIN_NAME_LEN = 2;

/** An id-derived soft-mention handle shorter than this is never considered for a match. */
export const SOFT_MENTION_MIN_ID_LEN = 3;
