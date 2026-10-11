import { log } from "../log.ts";
import type { HerdrCli } from "./cli.ts";
import { subscribeHerdrEvents, type HerdrSubscription } from "./socket.ts";
import { SubscriptionRetry } from "./subscription-retry.ts";
import type { BlockedPrompt } from "./blocked-prompt.ts";
import { OFFLINE_RUNTIME, runtimeFromAgentInfo, type BotRuntime, type HerdrAgentInfo } from "./types.ts";

export interface StatusMirrorDeps {
  readonly cli: HerdrCli;
  readonly socketPath: string | null;
  readonly botIds: () => readonly string[];
  readonly onChange: (botId: string, runtime: BotRuntime, previous: BotRuntime) => void;
  /** Reads and parses the form a blocked bot's pane is showing (null when nothing parseable). Called on
   * every refresh for every blocked bot so the mirrored prompt follows the pane (next question, review
   * screen). Absent: blocked bots carry `prompt: null`. */
  readonly readPrompt?: (botId: string) => Promise<BlockedPrompt | null>;
  /** True while an answer is being typed into that bot's form: the screen is mid-edit (the free-text
   * row shows the partial text), so the previous prompt is kept instead of re-reading. */
  readonly isPromptReadSuppressed?: (botId: string) => boolean;
  /** Poll cadence while the socket subscription is not ready/degraded, or while any bot is blocked (a
   * blocked bot's prompt card needs the pane re-read even though nothing herdr publishes an event for). */
  readonly pollIntervalMs?: number;
  /** Slower fallback cadence used only once the subscription is healthy AND no bot is blocked -- events
   * still trigger an immediate debounced refresh, so this is purely a safety-net poll at that point. */
  readonly healthyPollIntervalMs?: number;
  readonly debounceMs?: number;
  readonly resubscribeMs?: number;
  readonly handshakeTimeoutMs?: number;
  readonly now?: () => number;
  /** Fires with the interval every time `#schedulePoll()` arms the poll timer (start, every refresh's
   * finally, and every readiness change). Purely observational -- it does not replace the real timer --
   * so tests can assert the cadence *decision* deterministically instead of racing wall-clock polls. */
  readonly onPollScheduled?: (delayMs: number) => void;
}

const GLOBAL_SUBSCRIPTIONS: readonly Record<string, unknown>[] = [{ type: "pane.updated" }, { type: "pane.closed" }, { type: "pane.agent_detected" }];

function sameRuntime(a: BotRuntime, b: BotRuntime): boolean {
  return a.status === b.status && a.paneId === b.paneId && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId && a.kind === b.kind && samePrompt(a.prompt, b.prompt);
}

/** Identity plus the cursor/checkbox state: a toggled checkbox is a change the card has to show. */
function samePrompt(a: BlockedPrompt | null, b: BlockedPrompt | null): boolean {
  if (a == null || b == null) return a === b;
  return a.signature === b.signature && a.options.every((option, index) => option.selected === b.options[index]?.selected && option.checked === b.options[index]?.checked);
}

function errorCode(error: Error | null): string | null {
  return error != null && "code" in error && typeof (error as { code: unknown }).code === "string" ? (error as { code: string }).code : null;
}

export class StatusMirror {
  readonly #deps: StatusMirrorDeps;
  readonly #retry = new SubscriptionRetry();
  readonly #paneProbeRetry = new SubscriptionRetry();
  #runtimes: ReadonlyMap<string, BotRuntime> = new Map();
  #subscription: HerdrSubscription | null = null;
  #subscribedKey = "";
  /** true once a pane in our subscription request has been rejected as pane_not_found; limits us to global-only subscriptions until the probe gate allows another attempt. */
  #degraded = false;
  /** true once the current socket subscription has handshaken; false before the first one, while it is
   * being re-established, or once it closes. Part of what decides the poll cadence (see #pollIntervalMs). */
  #subscriptionReady = false;
  #pollTimer: NodeJS.Timeout | null = null;
  #debounceTimer: NodeJS.Timeout | null = null;
  #resubscribeTimer: NodeJS.Timeout | null = null;
  #refreshing: Promise<void> | null = null;
  #stopped = true;
  #subscriptionGeneration = 0;
  #lifecycleGeneration = 0;
  #lastCloseCode: string | null = null;
  #repeatCount = 0;
  /** Probe cycles a still-missing pane has failed since it was first reported (see the onClose branch). */
  #paneProbeRepeats = 0;

  constructor(deps: StatusMirrorDeps) {
    this.#deps = deps;
  }

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    void this.refresh();
    this.#schedulePoll();
    this.resubscribe();
  }

  stop(): void {
    this.#stopped = true;
    this.#subscriptionGeneration++;
    this.#lifecycleGeneration++;
    this.#subscriptionReady = false;
    if (this.#pollTimer != null) clearTimeout(this.#pollTimer);
    if (this.#debounceTimer != null) clearTimeout(this.#debounceTimer);
    if (this.#resubscribeTimer != null) clearTimeout(this.#resubscribeTimer);
    this.#pollTimer = null;
    this.#debounceTimer = null;
    this.#resubscribeTimer = null;
    this.#subscription?.close();
    this.#subscription = null;
    this.#subscribedKey = "";
  }

  get(botId: string): BotRuntime {
    return this.#runtimes.get(botId) ?? OFFLINE_RUNTIME;
  }

  snapshot(): ReadonlyMap<string, BotRuntime> {
    return this.#runtimes;
  }

  refresh(): Promise<void> {
    if (this.#refreshing != null) return this.#refreshing;
    this.#refreshing = this.#refreshOnce().finally(() => {
      this.#refreshing = null;
      // Re-arm regardless of how #refreshOnce() exited (success, a caught agentList() failure, or a
      // stale-lifecycle early return) -- a poll that never reschedules itself stops the mirror cold.
      this.#schedulePoll();
    });
    return this.#refreshing;
  }

  resubscribe(): void {
    const now = this.#now();
    if (this.#stopped || this.#deps.socketPath == null || !this.#retry.canAttempt(now)) return;
    const panes = [...new Set([...this.#runtimes.values()].map((runtime) => runtime.paneId).filter((paneId): paneId is string => paneId != null))].sort();
    const attemptPanes = this.#degraded && !this.#paneProbeRetry.canAttempt(now) ? [] : panes;
    const key = attemptPanes.join(",");
    if (this.#subscription != null && key === this.#subscribedKey) return;
    const generation = ++this.#subscriptionGeneration;
    const current = () => !this.#stopped && generation === this.#subscriptionGeneration;
    this.#subscription?.close();
    this.#subscription = null;
    this.#subscribedKey = key;
    this.#subscriptionReady = false;
    const attemptedWithPanes = attemptPanes.length > 0;
    const subscriptions = [...GLOBAL_SUBSCRIPTIONS, ...attemptPanes.map((paneId) => ({ type: "pane.agent_status_changed", pane_id: paneId }))];
    this.#subscription = subscribeHerdrEvents(this.#deps.socketPath, subscriptions, {
      onEvent: () => {
        if (!current()) return;
        this.#scheduleRefresh();
      },
      onReady: () => {
        if (!current()) return;
        this.#retry.ready();
        if (this.#resubscribeTimer != null) {
          clearTimeout(this.#resubscribeTimer);
          this.#resubscribeTimer = null;
        }
        if (attemptedWithPanes) {
          this.#paneProbeRetry.ready();
          if (this.#degraded) log("status-mirror", "herdr pane subscriptions recovered", { suppressedRepeats: this.#paneProbeRepeats });
          this.#degraded = false;
          this.#paneProbeRepeats = 0;
        }
        this.#lastCloseCode = null;
        this.#repeatCount = 0;
        this.#subscriptionReady = true;
        this.#schedulePoll(); // the subscription just turned healthy (or pane-recovered) -- re-arm at the right cadence now, not after the next poll tick
      },
      onClose: (error) => {
        if (!current()) return;
        this.#subscription = null;
        this.#subscribedKey = "";
        this.#subscriptionReady = false;
        this.#schedulePoll(); // health just got worse -- shrink the poll interval immediately instead of staying on a stale long one
        const code = errorCode(error);
        const isPaneNotFound = code === "pane_not_found" && attemptedWithPanes;
        if (isPaneNotFound) {
          // A pane herdr no longer knows fails every probe cycle for as long as it is gone, and the
          // global-only subscription that succeeds in between is a fallback, not a recovery -- so this
          // path keeps its own report memory (`#degraded`) instead of the transport one, which that
          // fallback success resets. Report the transition once; count the rest for the recovery line.
          if (this.#degraded) this.#paneProbeRepeats++;
          else log("status-mirror", "herdr event subscription closed; will retry", error?.message);
          this.#degraded = true;
          this.#paneProbeRetry.fail(this.#now());
        } else {
          this.#retry.fail(this.#now());
          if (code === this.#lastCloseCode) {
            this.#repeatCount++;
          } else {
            log("status-mirror", "herdr event subscription closed; will retry", error?.message);
            this.#lastCloseCode = code;
            this.#repeatCount = 0;
          }
        }
        if (this.#resubscribeTimer != null) clearTimeout(this.#resubscribeTimer);
        const delayMs = isPaneNotFound ? 0 : this.#deps.resubscribeMs ?? 30_000;
        this.#resubscribeTimer = setTimeout(() => {
          this.#resubscribeTimer = null;
          this.resubscribe();
        }, delayMs);
        this.#resubscribeTimer.unref();
      },
    }, { handshakeTimeoutMs: this.#deps.handshakeTimeoutMs });
  }

  #now(): number {
    return this.#deps.now?.() ?? Date.now();
  }

  #scheduleRefresh(): void {
    if (this.#debounceTimer != null) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => void this.refresh(), this.#deps.debounceMs ?? 150);
    this.#debounceTimer.unref();
  }

  /** Idempotent: always clears any pending poll and re-arms it at whatever cadence currently applies, so
   * calling it after every refresh (and on every readiness change) keeps the poll interval fresh without
   * ever leaving two timers running. */
  #schedulePoll(): void {
    if (this.#pollTimer != null) clearTimeout(this.#pollTimer);
    this.#pollTimer = null;
    if (this.#stopped) return;
    const delayMs = this.#currentPollIntervalMs();
    this.#deps.onPollScheduled?.(delayMs);
    this.#pollTimer = setTimeout(() => {
      this.#pollTimer = null;
      void this.refresh();
    }, delayMs);
    this.#pollTimer.unref();
  }

  /** The 5s (default) cadence applies whenever the socket isn't a reliable signal of change right now --
   * no socket at all, subscription not ready/degraded -- or when a bot is blocked (its prompt card needs
   * the pane's screen re-read every tick, which herdr does not push an event for). Otherwise the slower
   * 30s (default) fallback applies; socket events still trigger an immediate debounced refresh regardless. */
  #currentPollIntervalMs(): number {
    const anyBlocked = [...this.#runtimes.values()].some((runtime) => runtime.status === "blocked");
    const healthy = this.#deps.socketPath != null && this.#subscriptionReady && !this.#degraded && !anyBlocked;
    return healthy ? this.#deps.healthyPollIntervalMs ?? 30_000 : this.#deps.pollIntervalMs ?? 5_000;
  }

  async #refreshOnce(): Promise<void> {
    const lifecycle = this.#lifecycleGeneration;
    let agents;
    try {
      agents = await this.#deps.cli.agentList();
    } catch (error) {
      log("status-mirror", "agent list failed", error instanceof Error ? error.message : String(error));
      return;
    }
    if (lifecycle !== this.#lifecycleGeneration) return;
    const byName = new Map(agents.filter((agent) => agent.name != null).map((agent) => [agent.name as string, agent]));
    const previous = this.#runtimes;
    // Prompts are read before anything is published so the first "blocked" change already carries the
    // form -- a blocked-without-card flash would otherwise show on every approval.
    const entries = await Promise.all(this.#deps.botIds().map(async (botId): Promise<[string, BotRuntime]> => {
      const info = byName.get(botId);
      if (info == null) return [botId, OFFLINE_RUNTIME];
      return [botId, runtimeFromAgentInfo(info, await this.#promptFor(botId, info, previous.get(botId) ?? OFFLINE_RUNTIME))];
    }));
    if (lifecycle !== this.#lifecycleGeneration) return;
    const next = new Map<string, BotRuntime>(entries);
    this.#runtimes = next;
    for (const [botId, runtime] of next) {
      const before = previous.get(botId) ?? OFFLINE_RUNTIME;
      if (!sameRuntime(before, runtime)) this.#deps.onChange(botId, runtime, before);
    }
    this.resubscribe();
  }

  async #promptFor(botId: string, info: HerdrAgentInfo, before: BotRuntime): Promise<BlockedPrompt | null> {
    if (info.agent_status !== "blocked" || this.#deps.readPrompt == null) return null;
    if (this.#deps.isPromptReadSuppressed?.(botId) === true) return before.prompt;
    try {
      return await this.#deps.readPrompt(botId);
    } catch (error) {
      log("status-mirror", `could not read ${botId}'s blocked prompt`, error instanceof Error ? error.message : String(error));
      return before.prompt;
    }
  }
}
