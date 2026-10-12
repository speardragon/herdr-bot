import type { HostConfig } from "../config.ts";
import { greetingText, type BotOnboarding } from "../bots/onboarding.ts";
import { buildDmTurnPrompt, buildRoomTurnPrompt } from "../bots/prompts.ts";
import type { SayInbox } from "../bots/say-inbox.ts";
import { deliverInterrupt, runBotTurn } from "../bots/turn-runner.ts";
import { ControlError } from "../control/protocol.ts";
import { RoomCycleRunner, type MemberTurnResult, type RoomMember, type RoomMessage } from "../rooms/index.ts";
import type { HerdrCli } from "../herdr/cli.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import { log } from "../log.ts";
import { entryText } from "../model/entries.ts";
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
  /** Injectable clock, used only by the A8 loop guard's sliding window (tests pin it). */
  readonly now?: () => number;
}

// Loop guard for bot<->bot `message` -- caps how many messages either direction of one pair
// can exchange in a short window, so two bots cannot volley indefinitely without a human noticing.
export const LOOP_GUARD_MAX_MESSAGES = 3;
export const LOOP_GUARD_WINDOW_MS = 5 * 60 * 1000;

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function outcomeNotice(member: RoomMember, result: MemberTurnResult, paneId: string | null, turnTimeoutMs: number, hasPromptCard = false): string | null {
  const where = paneId == null ? "" : ` (pane ${paneId})`;
  switch (result.outcome) {
    case "settled": return null;
    case "busy": return `${member.name} is busy with other work in herdr${where}; skipped this turn.`;
    // The form itself is already in the chat as an answerable card; a notice next to it is noise. Only
    // a blocked pane whose screen could not be parsed still needs pointing at herdr.
    case "blocked": return hasPromptCard ? null : `${member.name} is waiting for an approval or answer in herdr${where}. Resolve it there to let the bot continue.`;
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
  /** Count of calls to `run(botId, ...)` that have started but not yet finished -- lets a caller peek
   * "would this botId have to wait right now" without acquiring the lock itself. */
  readonly #pending = new Map<string, number>();

  run<T>(botId: string, fn: () => Promise<T>): Promise<T> {
    this.#pending.set(botId, (this.#pending.get(botId) ?? 0) + 1);
    const prev = this.#chains.get(botId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.#chains.set(botId, next.catch(() => undefined));
    const release = (): void => {
      const count = (this.#pending.get(botId) ?? 1) - 1;
      if (count <= 0) this.#pending.delete(botId);
      else this.#pending.set(botId, count);
    };
    next.then(release, release);
    return next;
  }

  /** True while botId has at least one `run` call queued or executing. */
  isHeld(botId: string): boolean {
    return (this.#pending.get(botId) ?? 0) > 0;
  }
}

/** Folds curly apostrophes/quotes to ASCII and collapses whitespace so an LLM's normalized echo of the
 * greeting still matches the spec text. Used ONLY for the onboarding acceptance check, never for storage. */
function normalizeGreeting(text: string): string {
  // The greeting has a blank line between its two paragraphs; an agent may echo that as a literal "\n".
  return text.replace(/\\n/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

export class TurnService {
  readonly #deps: TurnServiceDeps;
  readonly #active = new Set<string>();
  readonly #botLocks: BotExecutionLock;
  /** A8: timestamps (ms) of recent bot<->bot `message` deliveries, keyed by the unordered pair. */
  readonly #loopGuard = new Map<string, number[]>();

  constructor(deps: TurnServiceDeps, botLocks: BotExecutionLock = new BotExecutionLock()) {
    this.#deps = deps;
    this.#botLocks = botLocks;
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
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

  /**
   * Called ONLY for a real user message (never for a bot-to-bot `message` -- `handleMessage`
   * does not call this), right after it is stored. Delivers it immediately into the terminal of every
   * bot whose turn in this chat is currently open, so that bot's next `say` can react to it instead of
   * answering only the instruction its turn started with. Fire-and-forget: a delivery failure is logged,
   * never thrown, since the caller (`host.sendUserMessage`) is synchronous.
   */
  onUserMessage(chatId: string, userEntryId: string, content: string): void {
    for (const botId of this.#deps.inbox.openBotsFor(chatId)) {
      this.#deps.inbox.markInterrupted(chatId, botId, userEntryId);
      // deliverInterrupt types literal keystrokes into the bot's pane (agentSendKeys) before its
      // `wait: false` agentPrompt -- harmless while the pane is genuinely mid-turn, but a BLOCKED pane
      // is showing an answerable approval/question prompt, and those keystrokes (letters, Enter, an
      // option key...) would land on it and could silently approve/deny/answer it instead of reaching
      // the agent as text. Skip the terminal delivery in that case; markInterrupted above already
      // guarantees the user's message is not lost -- the bot's next say (once unblocked and its turn
      // reopens) is still tagged `staleFor` this entry.
      if (this.#deps.mirror.get(botId).status === "blocked") continue;
      void deliverInterrupt(this.#deps.cli, { botId, content }).catch((error) => {
        log("turn", `failed to deliver a mid-turn interrupt to ${botId} in ${chatId}`, error instanceof Error ? error.message : String(error));
      });
    }
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
    const result = this.#deps.inbox.accept(chatId, bot.id, text);
    if (result.mode === "over-cap") throw new ControlError("over_cap", "you already said the maximum number of messages this turn; wait for your next turn");
    const fields: Record<string, unknown> = {};
    // A say that arrives after its turn already closed is kept (never discarded) but tagged
    // `late` so the UI can mark it, and the chat gets a one-line notice -- the timeout notice earlier
    // said "did not finish"; this says it actually did, later.
    if (result.mode === "late") {
      fields.late = true;
      if (result.lateAfterMs != null) fields.lateAfterMs = result.lateAfterMs;
    }
    // This say answers an instruction a newer user message has since superseded.
    if (result.staleFor != null) fields.staleFor = result.staleFor;
    // This say addresses a question the bot had to skip earlier while busy.
    if (result.answersHeld != null) fields.answersHeld = result.answersHeld;
    const entry = this.#deps.chat.appendBot(chatId, { id: bot.id, name: bot.name }, text, Object.keys(fields).length > 0 ? fields : undefined);
    if (result.answersHeld != null) this.#deps.chat.clearHeld(chatId, result.answersHeld, bot.id);
    if (result.mode === "late") this.#deps.chat.appendNotice(chatId, `${bot.name}이(가) 늦게 응답을 완료했습니다`);
    return { entryId: entry.id, mode: result.mode };
  }

  handleMessage(paneId: string, chatId: string, text: string): { entryId: string } {
    const sender = this.#deps.roster.resolveBotByPane(paneId);
    if (sender == null) throw new ControlError("unknown_pane", `No bot is bound to pane ${paneId}`);
    const body = text.trim();
    if (body.length === 0) throw new ControlError("invalid_params", "Message text must not be empty");
    const onboarding = sender.onboarding;
    if (onboarding != null && onboarding.stage !== "ready" && onboarding.stage !== "failed" && chatId !== sender.id) {
      throw new ControlError("not_a_member", `${sender.id} is still being set up and can only message its own chat`);
    }
    if (this.#deps.inbox.isOpen(chatId, sender.id)) {
      throw new ControlError("use_say", "Use say for the chat whose turn is currently open");
    }

    const kind = this.#deps.chat.chatKind(chatId);
    if (kind == null) throw new ControlError("unknown_chat", `Unknown chat: ${chatId}`);
    const targetBot = kind === "bot" ? this.#deps.roster.memberIdFor(chatId) : null;
    const roomMemberIds = kind === "room" ? this.#roomMembers(chatId) ?? [] : [];
    if (kind === "room" && !roomMemberIds.includes(sender.id)) {
      throw new ControlError("not_a_member", `${sender.id} is not a member of ${chatId}`);
    }
    if (kind === "bot" && targetBot == null) throw new ControlError("bot_not_ready", `${chatId} is not ready`);
    // Only a bot<->bot DM message is subject to the loop guard (a room post has a human
    // audience and other members watching, so it is not the "two bots volleying alone" failure mode).
    if (kind === "bot" && targetBot != null) this.#checkLoopGuard(sender, targetBot);

    const entry = this.#deps.chat.appendBot(chatId, { id: sender.id, name: sender.name }, body);
    void this.schedule(chatId);
    this.#recordMessageSentNotice(sender.id, chatId, kind, targetBot);
    return { entryId: entry.id };
  }

  /**
   * Rejects the 4th `message` within {@link LOOP_GUARD_WINDOW_MS} between the same two bots
   * (either direction counts toward the same pair). Throwing here means `handleMessage` never calls
   * `appendBot`, so the message is never delivered -- the rejection itself is the only trace, surfaced
   * both as the thrown error (to the CLI caller) and as a notice in the sender's own source chat so a
   * human watching that chat sees why the bot stopped mid-exchange.
   */
  #checkLoopGuard(sender: BotProfile, target: RoomMember): void {
    const key = pairKey(sender.id, target.id);
    const now = this.#now();
    const windowStart = now - LOOP_GUARD_WINDOW_MS;
    const recent = (this.#loopGuard.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
    if (recent.length >= LOOP_GUARD_MAX_MESSAGES) {
      const message = `loop guard: ask the user before messaging ${target.name} again`;
      const sourceChatId = this.#deps.inbox.openChatFor(sender.id) ?? sender.id;
      try {
        this.#deps.chat.appendNotice(sourceChatId, message);
      } catch (error) {
        log("turn", `failed to record a loop-guard notice in ${sourceChatId} for ${sender.id} -> ${target.id}`, error instanceof Error ? error.message : String(error));
      }
      throw new ControlError("over_cap", message);
    }
    this.#loopGuard.set(key, [...recent, now]);
  }

  /**
   * Records a `bot-message-sent` notice in the sender's SOURCE chat, after `appendBot` above
   * already delivered the real message to the target. The source is the chat whose turn the sender is
   * currently taking (`inbox.openChatFor`), falling back to the sender's own DM when no turn is open.
   * Never re-delivers the message: a failure here (unknown source chat, store error) is only logged.
   */
  #recordMessageSentNotice(senderId: string, targetChatId: string, targetKind: "bot" | "room", targetBot: RoomMember | null): void {
    const sourceChatId = this.#deps.inbox.openChatFor(senderId) ?? senderId;
    if (sourceChatId === targetChatId) return;
    const targetName = targetKind === "bot" ? (targetBot?.name ?? targetChatId) : (this.#deps.chat.summary(targetChatId)?.name ?? targetChatId);
    try {
      this.#deps.chat.appendBotEvent(sourceChatId, { type: "bot-message-sent", targetChatId, targetName, targetKind });
    } catch (error) {
      log("turn", `failed to record a bot-message-sent notice in ${sourceChatId} for ${senderId} -> ${targetChatId}`, error instanceof Error ? error.message : String(error));
    }
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
    const result = this.#deps.inbox.accept(bot.id, bot.id, text);
    const entry = this.#deps.chat.appendOnboardingGreeting(bot.id, { id: bot.id, name: bot.name }, expected, onboarding.requestId);
    return { entryId: entry.id, mode: result.mode === "in-turn" ? "in-turn" : "late" };
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
      const orchestrator = new RoomCycleRunner({
        resolveMembers: async (ids) => ids.flatMap((id) => { const member = this.#deps.roster.memberIdFor(id); return member == null ? [] : [member]; }),
        readHistory: () => this.#deps.chat.history(chatId),
        isCurrent: () => this.#deps.runQueue.currentEpoch(chatId) === epoch,
        runMemberTurn: ({ member, peers, newMessages }) => this.#memberTurn(chatId, kind, member, peers, newMessages),
        // A member currently holding its own execution lock (busy in some other chat) or
        // reported "working" by the mirror is peeked as busy WITHOUT waiting for that lock, so the
        // round can dispatch every other (available) member concurrently instead of queuing behind it.
        peekAvailability: (memberId) => (this.#deps.mirror.get(memberId).status === "working" || this.#botLocks.isHeld(memberId) ? "busy" : "available"),
        onMemberTurnEnded: (member, result) => {
          const runtime = this.#deps.mirror.get(member.id);
          const notice = outcomeNotice(member, result, runtime.paneId, this.#deps.config.turnTimeoutMs, runtime.prompt != null);
          if (notice != null) this.#deps.chat.appendNotice(chatId, notice);
          // The user message this busy-skip just dropped is not discarded -- mark it held so
          // this bot's NEXT turn in this chat (whatever triggers it) surfaces it explicitly.
          if (result.outcome === "busy") this.#markBusyHeld(chatId, member.id);
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

  #memberTurn(chatId: string, kind: "bot" | "room", member: RoomMember, peers: readonly RoomMember[], newMessages: readonly RoomMessage[]): Promise<MemberTurnResult> {
    return this.#botLocks.run(member.id, () => {
      // Profiles may change while this turn waits behind another chat's turn.
      const current = this.#deps.roster.memberIdFor(member.id);
      if (current == null) return Promise.resolve({ outcome: "offline" as const, spoken: [] });
      const latestPeers = peers.flatMap((peer) => { const latest = this.#deps.roster.memberIdFor(peer.id); return latest == null ? [] : [latest]; });
      const cliPath = this.#deps.config.cliPath;
      // Questions this bot was busy-skipped for earlier in this chat, oldest first --
      // surfaced explicitly in the prompt so the reply is not context-free, and carried into
      // runBotTurn/inbox.open so the first say this turn gets tagged `answersHeld`.
      const heldEntries = this.#deps.chat.heldEntriesFor(chatId, member.id);
      const held = heldEntries.flatMap((entry) => { const text = entryText(entry); return text == null ? [] : [text]; });
      const heldEntryIds = heldEntries.map((entry) => entry.id);
      const prompt = kind === "room"
        ? buildRoomTurnPrompt({ room: this.#roomIdentity(chatId), member: current, peers: latestPeers, newMessages, cliPath, held })
        : buildDmTurnPrompt({ bot: current, chatId, userName: this.#deps.config.userName, newMessages, cliPath, held });
      return runBotTurn({ cli: this.#deps.cli, mirror: this.#deps.mirror, inbox: this.#deps.inbox, turnTimeoutMs: this.#deps.config.turnTimeoutMs }, { chatId, botId: member.id, prompt, heldEntryIds });
    });
  }

  /** The most recent user message in `chatId`, marked held for `memberId`: this busy-skip
   * did not discard that question, it will resurface explicitly the next time this bot speaks here. */
  #markBusyHeld(chatId: string, memberId: string): void {
    const history = this.#deps.chat.history(chatId);
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const message = history[index];
      if (message?.speaker.kind === "user" && message.id != null) {
        this.#deps.chat.markHeld(chatId, message.id, memberId);
        return;
      }
    }
  }

  #roomIdentity(chatId: string): { id: string; name: string; description: string } {
    const summary = this.#deps.chat.summary(chatId);
    return { id: chatId, name: summary?.name ?? chatId, description: summary?.description ?? "" };
  }
}
