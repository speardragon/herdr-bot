/**
 * Design note -- deliberate behavior decisions for the room/DM turn-taking cycle, and the reasoning
 * behind each:
 *
 * 1. Literal `@`-mention boundary (ASCII word chars only) vs. soft-mention boundary (Unicode word
 *    chars) disagree on whether a non-ASCII suffix counts as "part of the word". KEPT AS-IS. Changing
 *    the literal check to be Unicode-aware would silently stop matching `@forge님`-style mentions
 *    (a literal handle immediately followed by a Korean honorific/suffix) that users may already be
 *    relying on. See literal-mentions.ts.
 *
 * 2. Held-question clearing is one-per-turn, not one-per-answered-question: several held messages
 *    are all re-shown every time the member speaks, but only the single oldest is ever cleared per
 *    turn. KEPT AS-IS -- this bookkeeping lives entirely outside this module (bots/say-inbox.ts +
 *    services/chat-service.ts's heldFor markers), so "fixing" it here would mean editing unrelated,
 *    already-correct files and changing caller-visible behavior.
 *
 * 3. The "is this text just a pass" recognizer is defined (pass.ts, `isPassLike`) but deliberately
 *    left UNWIRED. Nothing here consults it to change display, re-eligibility, caps, or the loop
 *    guard. The real "nothing to add" path is the dedicated zero-content pass action (see
 *    bots/prompts.ts's turn instructions / TurnService#handlePass), which produces no transcript
 *    entry at all; wiring the recognizer to suppress a message whose text merely *reads* like "pass"
 *    would be new, unspecified behavior.
 *
 * 4. Speaker ordering within a round is exactly mention order, then keyword/role fit, then join
 *    order (see ordering.ts) -- nothing else. There is deliberately no round-rotation helper and no
 *    member-set equality check: a utility nobody calls only grows the surface area for no behavior
 *    anyone depends on.
 *
 * 5. The stale-for marker is a single overwritable slot, not a queue, so a second interrupt during
 *    the same open turn silently supersedes the first. KEPT AS-IS -- same reasoning as #2, this is
 *    SayInbox's behavior (bots/say-inbox.ts), not this module's.
 *
 * 6. A member whose turn ends blocked/stalled/timeout/error after already speaking is re-prompted
 *    next round (not marked answered) despite the partial speech. This is intentional: a member
 *    isn't considered to have answered the round until its turn settles cleanly.
 */

import { MAX_TOTAL_SPOKEN_MESSAGES, PROMPT_HISTORY_TAIL, ROOM_MAX_ROUNDS } from "./constants.ts";
import { newSince, truncateTail } from "./history-view.ts";
import { orderSpeakers } from "./ordering.ts";
import { responderIdsFromStretch, stretchSinceLastHuman, wasMentionedSince } from "./responders.ts";
import type { MemberTurnResult, RoomCycleCapabilities, RoomCycleOptions, RoomMember } from "./types.ts";

/**
 * Runs one cycle (up to `maxRounds` rounds) against a fixed set of member ids, dispatching each
 * eligible member's turn in order, one at a time, per round.
 */
export class RoomCycleRunner {
  readonly #capabilities: RoomCycleCapabilities;
  readonly #maxRounds: number;
  readonly #maxSpokenMessages: number;

  constructor(capabilities: RoomCycleCapabilities, options: RoomCycleOptions = {}) {
    this.#capabilities = capabilities;
    this.#maxRounds = options.maxRounds ?? ROOM_MAX_ROUNDS;
    this.#maxSpokenMessages = options.maxSpokenMessages ?? MAX_TOTAL_SPOKEN_MESSAGES;
  }

  async run(args: { readonly memberIds: readonly string[] }): Promise<void> {
    const members = await this.#capabilities.resolveMembers(args.memberIds);
    if (members.length === 0) return;
    const membersById = new Map(members.map((member) => [member.id, member]));
    const joinOrder = members.map((member) => member.id);

    let totalSpoken = 0;
    // Transcript length immediately after each member's own settled turn, keyed by member id --
    // absence means "never marked answered this cycle" (never settled, or a non-settled outcome).
    const answeredAt = new Map<string, number>();

    for (let round = 0; round < this.#maxRounds; round += 1) {
      if (!this.#capabilities.isCurrent()) return;

      const history = this.#capabilities.readHistory();
      const stretch = stretchSinceLastHuman(history);
      const responderIds = new Set(responderIdsFromStretch(stretch, members));
      const candidates = joinOrder.filter((id) => {
        if (!responderIds.has(id)) return false;
        const answeredLength = answeredAt.get(id);
        return answeredLength == null || wasMentionedSince(history, answeredLength, id, members);
      });
      if (candidates.length === 0) return; // early cycle end (a): nobody remains eligible.

      const ordered = orderSpeakers(candidates, stretch, membersById);
      // Decided once, from this round's final candidate count -- never recomputed as members are
      // processed.
      const busySkipApplies = ordered.length > 1;

      let roundSpoken = 0;
      for (const memberId of ordered) {
        if (!this.#capabilities.isCurrent() || totalSpoken >= this.#maxSpokenMessages) return;
        const member = membersById.get(memberId);
        if (member == null) continue;

        const result = await this.#dispatch(member, members, round, busySkipApplies);
        this.#capabilities.onMemberTurnEnded?.(member, result);
        totalSpoken += result.spoken.length;
        roundSpoken += result.spoken.length;
        if (result.outcome === "settled") answeredAt.set(memberId, this.#capabilities.readHistory().length);
        if (totalSpoken >= this.#maxSpokenMessages) return;
      }

      if (roundSpoken === 0) return; // early cycle end (b): the round produced nothing.
    }
  }

  async #dispatch(member: RoomMember, members: readonly RoomMember[], round: number, busySkipApplies: boolean): Promise<MemberTurnResult> {
    if (busySkipApplies && this.#capabilities.peekAvailability?.(member.id) === "busy") {
      return { outcome: "busy", spoken: [] };
    }
    // The per-member "new since I last spoke" view is computed fresh at dispatch time (so it
    // includes whatever an earlier member in this very round already said), then truncated to the
    // prompt tail window.
    const freshHistory = this.#capabilities.readHistory();
    const peers = members.filter((peer) => peer.id !== member.id);
    const newMessages = truncateTail(newSince(freshHistory, member.id), PROMPT_HISTORY_TAIL);
    return this.#capabilities.runMemberTurn({ member, peers, newMessages, round });
  }
}
