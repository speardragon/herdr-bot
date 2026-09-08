import {
  GROUP_MAX_MEMBER_TURNS,
  GROUP_MAX_ROUNDS,
  messagesSinceMemberLastSpoke,
  orderRoundSpeakers,
  resolveResponders,
  type GroupMember,
  type GroupMessage,
} from "./group-chat.ts";

export type TurnOutcome = "settled" | "busy" | "blocked" | "stalled" | "timeout" | "offline" | "error";

export interface MemberTurnResult {
  readonly outcome: TurnOutcome;
  readonly spoken: readonly string[];
}

export interface MemberTurnArgs {
  readonly member: GroupMember;
  readonly peers: readonly GroupMember[];
  readonly newMessages: readonly GroupMessage[];
  readonly round: number;
}

export interface GroupOrchestratorDeps {
  resolveMembers(ids: readonly string[]): Promise<GroupMember[]>;
  readHistory(): readonly GroupMessage[];
  isCurrent(): boolean;
  runMemberTurn(args: MemberTurnArgs): Promise<MemberTurnResult>;
  onMemberTurnEnded?(member: GroupMember, result: MemberTurnResult): void;
}

export interface GroupOrchestratorOptions {
  readonly maxRounds?: number;
  readonly maxMemberTurns?: number;
}

/** Bounded, epoch-cancellable round robin for one room turn (ported from grok-bot). */
export class GroupChatOrchestrator {
  readonly deps: GroupOrchestratorDeps;
  readonly maxRounds: number;
  readonly maxMemberTurns: number;

  constructor(deps: GroupOrchestratorDeps, options: GroupOrchestratorOptions = {}) {
    this.deps = deps;
    this.maxRounds = options.maxRounds ?? GROUP_MAX_ROUNDS;
    this.maxMemberTurns = options.maxMemberTurns ?? GROUP_MAX_MEMBER_TURNS;
  }

  async run(args: { readonly memberIds: readonly string[] }): Promise<void> {
    const members = await this.deps.resolveMembers(args.memberIds);
    if (members.length === 0) return;
    const memberById = new Map(members.map((member) => [member.id, member]));
    let totalMessages = 0;

    for (let round = 0; round < this.maxRounds; round += 1) {
      if (!this.deps.isCurrent()) return;
      const responderIds = resolveResponders(members, this.deps.readHistory()).map((member) => member.id);
      let messagesThisRound = 0;

      for (const memberId of orderRoundSpeakers(responderIds, round)) {
        if (totalMessages >= this.maxMemberTurns || !this.deps.isCurrent()) return;
        const member = memberById.get(memberId);
        if (member == null) continue;
        const result = await this.runOneTurn(member, members, round);
        this.deps.onMemberTurnEnded?.(member, result);
        totalMessages += result.spoken.length;
        messagesThisRound += result.spoken.length;
        if (totalMessages >= this.maxMemberTurns) return;
      }

      if (messagesThisRound === 0) return;
    }
  }

  private async runOneTurn(member: GroupMember, members: readonly GroupMember[], round: number): Promise<MemberTurnResult> {
    const peers = members.filter((other) => other.id !== member.id);
    const newMessages = messagesSinceMemberLastSpoke(this.deps.readHistory(), member.id);
    try {
      return await this.deps.runMemberTurn({ member, peers, newMessages, round });
    } catch {
      return { outcome: "error", spoken: [] };
    }
  }
}
