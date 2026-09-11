import { log } from "../log.ts";
import type { HerdrCli } from "./cli.ts";
import { subscribeHerdrEvents, type HerdrSubscription } from "./socket.ts";
import { SubscriptionRetry } from "./subscription-retry.ts";
import { OFFLINE_RUNTIME, runtimeFromAgentInfo, type BotRuntime } from "./types.ts";

export interface StatusMirrorDeps {
  readonly cli: HerdrCli;
  readonly socketPath: string | null;
  readonly botIds: () => readonly string[];
  readonly onChange: (botId: string, runtime: BotRuntime, previous: BotRuntime) => void;
  readonly pollIntervalMs?: number;
  readonly debounceMs?: number;
  readonly resubscribeMs?: number;
  readonly handshakeTimeoutMs?: number;
  readonly now?: () => number;
}

const GLOBAL_SUBSCRIPTIONS: readonly Record<string, unknown>[] = [{ type: "pane.updated" }, { type: "pane.closed" }, { type: "pane.agent_detected" }];

function sameRuntime(a: BotRuntime, b: BotRuntime): boolean {
  return a.status === b.status && a.paneId === b.paneId && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId && a.kind === b.kind;
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
  #pollTimer: NodeJS.Timeout | null = null;
  #debounceTimer: NodeJS.Timeout | null = null;
  #resubscribeTimer: NodeJS.Timeout | null = null;
  #refreshing: Promise<void> | null = null;
  #stopped = true;
  #subscriptionGeneration = 0;
  #lifecycleGeneration = 0;
  #lastCloseCode: string | null = null;
  #repeatCount = 0;

  constructor(deps: StatusMirrorDeps) {
    this.#deps = deps;
  }

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    void this.refresh();
    const interval = this.#deps.pollIntervalMs ?? 5_000;
    this.#pollTimer = setInterval(() => void this.refresh(), interval);
    this.#pollTimer.unref();
    this.resubscribe();
  }

  stop(): void {
    this.#stopped = true;
    this.#subscriptionGeneration++;
    this.#lifecycleGeneration++;
    if (this.#pollTimer != null) clearInterval(this.#pollTimer);
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
          if (this.#degraded) log("status-mirror", "herdr pane subscriptions recovered", { repeats: this.#repeatCount });
          this.#degraded = false;
          this.#lastCloseCode = null;
          this.#repeatCount = 0;
        }
      },
      onClose: (error) => {
        if (!current()) return;
        this.#subscription = null;
        this.#subscribedKey = "";
        const code = errorCode(error);
        const isPaneNotFound = code === "pane_not_found" && attemptedWithPanes;
        if (isPaneNotFound) {
          this.#degraded = true;
          this.#paneProbeRetry.fail(this.#now());
        } else {
          this.#retry.fail(this.#now());
        }
        if (code === this.#lastCloseCode) {
          this.#repeatCount++;
        } else {
          log("status-mirror", "herdr event subscription closed; will retry", error?.message);
          this.#lastCloseCode = code;
          this.#repeatCount = 0;
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
    const next = new Map<string, BotRuntime>();
    for (const botId of this.#deps.botIds()) {
      const info = byName.get(botId);
      next.set(botId, info == null ? OFFLINE_RUNTIME : runtimeFromAgentInfo(info));
    }
    const previous = this.#runtimes;
    this.#runtimes = next;
    for (const [botId, runtime] of next) {
      const before = previous.get(botId) ?? OFFLINE_RUNTIME;
      if (!sameRuntime(before, runtime)) this.#deps.onChange(botId, runtime, before);
    }
    this.resubscribe();
  }
}
