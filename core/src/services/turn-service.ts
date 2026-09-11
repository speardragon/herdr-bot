import type { HostConfig } from "../config.ts";
import { greetingText, type BotOnboarding } from "../bots/onboarding.ts";
import { buildDmTurnPrompt, buildRoomTurnPrompt } from "../bots/prompts.ts";
import type { SayInbox } from "../bots/say-inbox.ts";
import { runBotTurn } from "../bots/turn-runner.ts";
import { ControlError } from "../control/protocol.ts";
import type { GroupMember, GroupMessage } from "../group/group-chat.ts";
import { GroupChatOrchestrator, type MemberTurnResult } from "../group/orchestrator.ts";
import type { HerdrCli } from "../herdr/cli.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import { log } from "../log.ts";
import type { ChatService } from "./chat-service.ts";
import type { RosterService } from "./roster-service.ts";
import type { RunQueue } from "./run-queue.ts";
import type { BotProfile } from "../store/profile-store.ts";

export interface TurnServiceDeps {
  readonly config: HostConfig;
  readonly roster: RosterService;
  readonly chat: ChatService;
  readonly runQueue: RunQueue;
  readonly cli: HerdrCli;
  readonly mirror: StatusMirror;
  readonly inbox: SayInbox;
}

export function outcomeNotice(member: GroupMember, result: MemberTurnResult, paneId: string | null, turnTimeoutMs: number): string | null {
  const where = paneId == null ? "" : ` (pane ${paneId})`;
  switch (result.outcome) {
    case "settled": return null;
    case "busy": return `${member.name} is busy with other work in herdr${where}; skipped this turn.`;
    case "blocked": return `${member.name} is waiting for an approval or answer in herdr${where}. Resolve it there to let the bot continue.`;
    case "stalled": return `${member.name} did not react to the turn prompt${where}; check its pane.`;
    case "timeout": return `${member.name} did not finish its turn within ${Math.round(turnTimeoutMs / 1000)}s${where}.`;
    case "offline": return `${member.name} is offline (no herdr agent named "${member.id}").`;
    case "error": return `${member.name}'s turn failed; see the host log.`;
  }
}

/**
 * Serialises every herdr `agentPrompt` for one bot, whichever chat drives it. A DM turn, a room turn,
 * and the onboarding brief/greeting all acquire the same bot's lock so their prompts never overlap in
 * the single terminal that bot owns. Keyed by bot id, not chat id.
 */
export class BotExecutionLock {
  readonly #chains = new Map<string, Promise<unknown>>();

  run<T>(botId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.#chains.get(botId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.#chains.set(botId, next.catch(() => undefined));
    return next;
  }
}

/** Folds curly apostrophes/quotes to ASCII and collapses whitespace so an LLM's normalized echo of the
 * greeting still matches the spec text. Used ONLY for the onboarding acceptance check, never for storage. */
function normalizeGreeting(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

export class TurnService {
  readonly #deps: TurnServiceDeps;
  readonly #active = new Set<string>();
  readonly #botLocks: BotExecutionLock;

  constructor(deps: TurnServiceDeps, botLocks: BotExecutionLock = new BotExecutionLock()) {
    this.#deps = deps;
    this.#botLocks = botLocks;
  }

  isTurnActive(chatId: string): boolean {
    return this.#active.has(chatId);
  }

  /** Runs `fn` while holding a bot's execution lock (see {@link BotExecutionLock}). */
  withBotLock<T>(botId: string, fn: () => Promise<T>): Promise<T> {
    return this.#botLocks.run(botId, fn);
  }

  /**
   * Runs the onboarding greeting as a real bot turn against its own DM. The caller already holds the
   * bot lock (the brief and greeting share one acquisition), so this does NOT re-acquire it, and it
   * refreshes the mirror first so a stale `working` from spawn does not make the turn skip as busy.
   */
  async runGreetingTurn(botId: string, prompt: string): Promise<MemberTurnResult> {
    await this.#deps.mirror.refresh();
    return runBotTurn({ cli: this.#deps.cli, mirror: this.#deps.mirror, inbox: this.#deps.inbox, turnTimeoutMs: this.#deps.config.turnTimeoutMs }, { chatId: botId, botId, prompt });
  }

  schedule(chatId: string): Promise<void> {
    const epoch = this.#deps.runQueue.nextEpoch(chatId);
    return this.#deps.runQueue.enqueue(chatId, () => this.#runTurn(chatId, epoch));
  }

  handleSay(paneId: string, chatId: string, text: string): { entryId: string; mode: "in-turn" | "late" } {
    const bot = this.#deps.roster.resolveBotByPane(paneId);
    if (bot == null) throw new ControlError("unknown_pane", `pane ${paneId} is not a herdr-bot bot`);
    const onboarding = bot.onboarding;
    // A bot still in setup may only ever message its own DM -- never another bot's DM or a room.
    if (onboarding != null && onboarding.stage !== "ready" && onboarding.stage !== "failed" && chatId !== bot.id) {
      throw new ControlError("not_a_member", `${bot.id} is still being set up and can only message its own chat`);
    }
    this.#assertMember(bot.id, chatId);
    if (onboarding != null && onboarding.stage === "greeting" && chatId === bot.id) return this.#handleOnboardingSay(bot, onboarding, text);
    const mode = this.#deps.inbox.accept(chatId, bot.id, text);
    if (mode === "over-cap") throw new ControlError("over_cap", "you already said the maximum number of messages this turn; wait for your next turn");
    const entry = this.#deps.chat.appendBot(chatId, { id: bot.id, name: bot.name }, text);
    return { entryId: entry.id, mode };
  }

  /**
   * The say a bot makes during its greeting turn: stored once, verbatim as the canonical greeting,
   * tagged with the onboarding key. A repeat for the same key returns the existing entry (idempotent);
   * a say whose text is not the instructed greeting is rejected so the sequence surfaces a setup error.
   */
  #handleOnboardingSay(bot: BotProfile, onboarding: BotOnboarding, text: string): { entryId: string; mode: "in-turn" | "late" } {
    const existing = this.#deps.chat.findByOnboardingKey(bot.id, onboarding.requestId);
    if (existing != null) return { entryId: existing.id, mode: "late" };
    const expected = greetingText(onboarding.locale);
    // An LLM echoing the JSON-stringified greeting may normalize the spec's curly apostrophe/quotes to
    // ASCII (and re-wrap whitespace). Compare on a normalized form so that does not fail onboarding --
    // but keep storing the canonical (spec) greeting text as the saved entry.
    if (normalizeGreeting(text) !== normalizeGreeting(expected)) throw new ControlError("invalid_params", "onboarding say did not match the expected greeting");
    const mode = this.#deps.inbox.accept(bot.id, bot.id, text);
    const entry = this.#deps.chat.appendOnboardingGreeting(bot.id, { id: bot.id, name: bot.name }, expected, onboarding.requestId);
    return { entryId: entry.id, mode: mode === "in-turn" ? "in-turn" : "late" };
  }

  handlePass(paneId: string, chatId: string): void {
    this.#requireBot(paneId, chatId);
  }

  #requireBot(paneId: string, chatId: string): BotProfile {
    const bot = this.#deps.roster.resolveBotByPane(paneId);
    if (bot == null) throw new ControlError("unknown_pane", `pane ${paneId} is not a herdr-bot bot`);
    this.#assertMember(bot.id, chatId);
    return bot;
  }

  #assertMember(botId: string, chatId: string): void {
    const kind = this.#deps.chat.chatKind(chatId);
    if (kind == null) throw new ControlError("unknown_chat", `no chat "${chatId}"`);
    if (kind === "bot" && chatId !== botId) throw new ControlError("not_a_member", `"${chatId}" is another bot's DM`);
    if (kind === "room") {
      const members = this.#roomMembers(chatId);
      if (members != null && !members.includes(botId)) throw new ControlError("not_a_member", `${botId} is not a member of ${chatId}`);
    }
  }

  #roomMembers(chatId: string): readonly string[] | null {
    const summary = this.#deps.chat.summary(chatId);
    return summary?.isGroup === true ? summary.memberIds : null;
  }

  async #runTurn(chatId: string, epoch: number): Promise<void> {
    const kind = this.#deps.chat.chatKind(chatId);
    if (kind == null) return;
    const memberIds = kind === "room" ? this.#roomMembers(chatId) ?? [] : [chatId];
    this.#active.add(chatId);
    this.#deps.chat.emitUpsert(chatId);
    try {
      const orchestrator = new GroupChatOrchestrator({
        resolveMembers: async (ids) => ids.flatMap((id) => { const member = this.#deps.roster.memberIdFor(id); return member == null ? [] : [member]; }),
        readHistory: () => this.#deps.chat.history(chatId),
        isCurrent: () => this.#deps.runQueue.currentEpoch(chatId) === epoch,
        runMemberTurn: ({ member, peers, newMessages }) => this.#memberTurn(chatId, kind, member, peers, newMessages),
        onMemberTurnEnded: (member, result) => {
          const notice = outcomeNotice(member, result, this.#deps.mirror.get(member.id).paneId, this.#deps.config.turnTimeoutMs);
          if (notice != null) this.#deps.chat.appendNotice(chatId, notice);
        },
      }, kind === "bot" ? { maxRounds: 1 } : {});
      await orchestrator.run({ memberIds });
    } catch (error) {
      log("turn", `turn for ${chatId} crashed`, error instanceof Error ? error.message : String(error));
    } finally {
      this.#active.delete(chatId);
      this.#deps.chat.emitUpsert(chatId);
    }
  }

  #memberTurn(chatId: string, kind: "bot" | "room", member: GroupMember, peers: readonly GroupMember[], newMessages: readonly GroupMessage[]): Promise<MemberTurnResult> {
    const cliPath = this.#deps.config.cliPath;
    const prompt = kind === "room"
      ? buildRoomTurnPrompt({ room: this.#roomIdentity(chatId), member, peers, newMessages, cliPath })
      : buildDmTurnPrompt({ bot: member, chatId, userName: this.#deps.config.userName, newMessages, cliPath });
    return this.#botLocks.run(member.id, () => runBotTurn({ cli: this.#deps.cli, mirror: this.#deps.mirror, inbox: this.#deps.inbox, turnTimeoutMs: this.#deps.config.turnTimeoutMs }, { chatId, botId: member.id, prompt }));
  }

  #roomIdentity(chatId: string): { id: string; name: string; description: string } {
    const summary = this.#deps.chat.summary(chatId);
    return { id: chatId, name: summary?.name ?? chatId, description: summary?.description ?? "" };
  }
}
