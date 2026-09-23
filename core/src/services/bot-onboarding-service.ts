import type { HostConfig } from "../config.ts";
import { buildGreetingPrompt, isValidRequestId, reservedBotId, type BotOnboarding, type OnboardingStage, type QuickCreateRequest } from "../bots/onboarding.ts";
import { buildDmTurnPrompt } from "../bots/prompts.ts";
import { log } from "../log.ts";
import type { TurnOutcome } from "../group/orchestrator.ts";
import type { ChatService } from "./chat-service.ts";
import { RosterError, type RosterService } from "./roster-service.ts";
import type { TurnService } from "./turn-service.ts";
import type { BotProfile, ProfileStore } from "../store/profile-store.ts";

export interface BotOnboardingDeps {
  readonly config: HostConfig;
  readonly profiles: ProfileStore;
  readonly roster: RosterService;
  readonly chat: ChatService;
  readonly turns: TurnService;
  readonly now?: () => number;
}

function greetingError(outcome: TurnOutcome): string {
  switch (outcome) {
    case "blocked": return "the bot is waiting for an approval or login in its herdr pane; resolve it there, then retry setup";
    case "offline": return "the bot's herdr agent went offline before it could greet you; retry setup";
    default: return "the bot did not send its first greeting; retry setup";
  }
}

/**
 * Turns a "quick create" into: a reserved profile saved (and returned) instantly, then an async
 * provision -- spawn -> identity brief -> a real greeting from the agent itself. Every stage is
 * persisted on the profile so a crash or restart can recover deterministically from the transcript.
 */
export class BotOnboardingService {
  readonly #deps: BotOnboardingDeps;
  readonly #inflight = new Map<string, Promise<void>>();
  #stopped = false;

  constructor(deps: BotOnboardingDeps) {
    this.#deps = deps;
  }

  /** Saves and returns the reserved profile immediately; provisioning runs in the background. */
  create(request: QuickCreateRequest): BotProfile {
    if (!isValidRequestId(request.requestId)) throw new RosterError("invalid_bot_id", "requestId must be a UUID");
    if (request.locale !== "ko" && request.locale !== "en") throw new RosterError("invalid_bot_id", 'locale must be "ko" or "en"');
    const id = reservedBotId(request.requestId);
    const existing = this.#deps.profiles.get(id);
    // Idempotent for a double-clicked create button or a timed-out retry that reuses the same UUID.
    if (existing != null) return existing;
    const profile = this.#reservedProfile(id, request);
    this.#deps.profiles.save(profile);
    this.#stopped = false;
    this.#track(id, this.#provision(id, request.requestId, request.locale));
    return profile;
  }

  /**
   * Re-runs provisioning against the SAME profile (never a new one). Only a bot whose onboarding has
   * actually `failed` and has no provision still in flight may be retried -- so a stray retry on a
   * live/ready bot (or a double-clicked retry) can never flip it back through briefing/greeting and
   * re-prompt an agent the user is already talking to.
   */
  retry(id: string): BotProfile {
    const profile = this.#deps.profiles.get(id);
    if (profile == null || profile.onboarding == null) throw new RosterError("unknown_bot", `no onboarding bot "${id}" to retry`);
    if (this.#inflight.has(id)) throw new RosterError("bot_not_ready", `"${id}" is still being set up`);
    if (profile.onboarding.stage !== "failed") throw new RosterError("bot_not_ready", `"${id}" is not in a failed setup state`);
    const requestId = profile.onboarding.requestId;
    const locale = profile.onboarding.locale;
    const next: BotProfile = { ...profile, onboarding: { requestId, locale, stage: "provisioning", error: null }, updatedAt: this.#now() };
    this.#deps.profiles.save(next);
    this.#deps.chat.emitUpsert(id);
    this.#stopped = false;
    this.#track(id, this.#provision(id, requestId, locale));
    return next;
  }

  /** Stops accepting new provisioning results so a late async step cannot revive a stopped host. */
  stop(): void {
    this.#stopped = true;
  }

  /** Awaits the in-flight provision for a bot (tests use this before asserting/cleaning up). */
  settled(id: string): Promise<void> {
    return this.#inflight.get(id) ?? Promise.resolve();
  }

  /**
   * On startup, resolve any profile left mid-stage by a crash: `ready` if its greeting is already in
   * the transcript, otherwise `failed` (offering retry). Never auto-restarts a provision, so a restart
   * can't spawn a duplicate agent.
   */
  recover(): void {
    for (const profile of this.#deps.profiles.list()) {
      const onboarding = profile.onboarding;
      if (onboarding == null || onboarding.stage === "ready" || onboarding.stage === "failed") continue;
      const greeted = this.#deps.chat.findByOnboardingKey(profile.id, onboarding.requestId) != null;
      const resolved: BotOnboarding = greeted
        ? { ...onboarding, stage: "ready", error: null }
        : { ...onboarding, stage: "failed", error: "setup was interrupted; retry to finish" };
      this.#deps.profiles.save({ ...profile, onboarding: resolved, updatedAt: this.#now() });
    }
  }

  async #provision(id: string, requestId: string, locale: "ko" | "en"): Promise<void> {
    try {
      if (this.#gone(id)) return;
      // Spawn, brief, and greeting all run under one acquisition of the bot's execution lock so a
      // user DM turn cannot slip a prompt in before the identity brief (or hit the still-spawning
      // agent and report a spurious "offline"). deleteBot never takes the lock, so delete still wins.
      await this.#deps.turns.withBotLock(id, async () => {
        if (this.#gone(id)) return;
        const provisioned = await this.#deps.roster.provisionReservedBot(id);
        if (this.#gone(id)) return;
        if (provisioned.status === "needs_setup") {
          this.#setStage(id, "failed", `finish first-run setup in the herdr pane (${provisioned.profile.herdr.paneId ?? "unknown"}), then retry`);
          return;
        }
        this.#setStage(id, "briefing");
        const briefed = await this.#deps.roster.briefReservedBot(this.#currentProfile(id));
        if (this.#gone(id)) return;
        if (!briefed) {
          this.#setStage(id, "failed", "the bot did not confirm its setup briefing; retry setup");
          return;
        }
        this.#setStage(id, "greeting");
        const result = await this.#deps.turns.runGreetingTurn(id, this.#greetingPrompt(id, locale));
        if (this.#gone(id)) return;
        // The transcript key is the source of truth: if the greeting landed, a later CLI wait error
        // (timeout/stalled) must NOT roll the bot back to a setup failure.
        if (this.#deps.chat.findByOnboardingKey(id, requestId) != null) {
          this.#setStage(id, "ready");
          return;
        }
        this.#setStage(id, "failed", greetingError(result.outcome));
      });
    } catch (error) {
      // The profile was removed mid-provision (stop/delete): do not resurrect it.
      if (error instanceof RosterError && error.code === "unknown_bot") return;
      log("onboarding", `provisioning ${id} failed`, error instanceof Error ? error.message : String(error));
      if (this.#gone(id)) return;
      if (this.#deps.chat.findByOnboardingKey(id, requestId) != null) {
        this.#setStage(id, "ready");
        return;
      }
      this.#setStage(id, "failed", error instanceof Error ? error.message : String(error));
    }
  }

  #greetingPrompt(id: string, locale: "ko" | "en"): string {
    const profile = this.#currentProfile(id);
    const dm = buildDmTurnPrompt({ bot: { id, name: profile.name, description: profile.description }, chatId: id, userName: this.#deps.config.userName, newMessages: [], cliPath: this.#deps.config.cliPath });
    return `${dm}\n${buildGreetingPrompt(id, locale)}`;
  }

  #reservedProfile(id: string, request: QuickCreateRequest): BotProfile {
    const now = this.#now();
    return {
      id,
      // herdr-bot: a name typed into the "+" combobox before selecting "이름이 "...인 Bot 만들기"
      // wins; leaving the combobox empty (plain "Create a new Bot") reserves an untitled bot the
      // user renames later, plain "새 Bot"/"New Bot" with no disambiguating suffix -- ids already
      // differ (bot-<requestId>), so a collision-avoidance suffix on the display name isn't needed.
      name: request.name?.trim() || (request.locale === "ko" ? "새 Bot" : "New Bot"),
      description: "",
      kind: this.#deps.config.defaultKind,
      cwd: this.#deps.config.defaultCwd,
      permissionMode: "ask",
      model: null,
      reasoningEffort: null,
      avatarShape: null,
      avatarColor: null,
      adopted: false,
      herdr: { paneId: null, workspaceId: null, sessionId: null },
      notifyOnUpdatesEnabled: true,
      isHiddenFromSidebar: false,
      createdAt: now,
      updatedAt: now,
      onboarding: { requestId: request.requestId, locale: request.locale, stage: "provisioning", error: null },
    };
  }

  #setStage(id: string, stage: OnboardingStage, error: string | null = null): void {
    const profile = this.#deps.profiles.get(id);
    if (profile == null || profile.onboarding == null) return; // deleted or legacy: never resurrect
    this.#deps.profiles.save({ ...profile, onboarding: { ...profile.onboarding, stage, error }, updatedAt: this.#now() });
    this.#deps.chat.emitUpsert(id);
  }

  #currentProfile(id: string): BotProfile {
    const profile = this.#deps.profiles.get(id);
    if (profile == null) throw new RosterError("unknown_bot", `bot "${id}" was removed during provisioning`);
    return profile;
  }

  #gone(id: string): boolean {
    return this.#stopped || this.#deps.profiles.get(id) == null;
  }

  #track(id: string, work: Promise<void>): void {
    const done = work.catch(() => undefined).finally(() => {
      if (this.#inflight.get(id) === done) this.#inflight.delete(id);
    });
    this.#inflight.set(id, done);
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }
}
