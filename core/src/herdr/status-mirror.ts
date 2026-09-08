import { log } from "../log.ts";
import type { HerdrCli } from "./cli.ts";
import { subscribeHerdrEvents, type HerdrSubscription } from "./socket.ts";
import { OFFLINE_RUNTIME, runtimeFromAgentInfo, type BotRuntime } from "./types.ts";

export interface StatusMirrorDeps {
  readonly cli: HerdrCli;
  readonly socketPath: string | null;
  readonly botIds: () => readonly string[];
  readonly onChange: (botId: string, runtime: BotRuntime, previous: BotRuntime) => void;
  readonly pollIntervalMs?: number;
  readonly debounceMs?: number;
  readonly resubscribeMs?: number;
}

const GLOBAL_SUBSCRIPTIONS: readonly Record<string, unknown>[] = [{ type: "pane.updated" }, { type: "pane.closed" }, { type: "pane.agent_detected" }];

function sameRuntime(a: BotRuntime, b: BotRuntime): boolean {
  return a.status === b.status && a.paneId === b.paneId && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId && a.kind === b.kind;
}

export class StatusMirror {
  readonly #deps: StatusMirrorDeps;
  #runtimes: ReadonlyMap<string, BotRuntime> = new Map();
  #subscription: HerdrSubscription | null = null;
  #subscribedPanes = "";
  #pollTimer: NodeJS.Timeout | null = null;
  #debounceTimer: NodeJS.Timeout | null = null;
  #resubscribeTimer: NodeJS.Timeout | null = null;
  #refreshing: Promise<void> | null = null;
  #stopped = true;

  constructor(deps: StatusMirrorDeps) {
    this.#deps = deps;
  }

  start(): void {
    this.#stopped = false;
    void this.refresh();
    const interval = this.#deps.pollIntervalMs ?? 5_000;
    this.#pollTimer = setInterval(() => void this.refresh(), interval);
    this.#pollTimer.unref();
    this.resubscribe();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#pollTimer != null) clearInterval(this.#pollTimer);
    if (this.#debounceTimer != null) clearTimeout(this.#debounceTimer);
    if (this.#resubscribeTimer != null) clearTimeout(this.#resubscribeTimer);
    this.#subscription?.close();
    this.#subscription = null;
    this.#subscribedPanes = "";
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
    if (this.#stopped || this.#deps.socketPath == null) return;
    const panes = [...this.#runtimes.values()].map((runtime) => runtime.paneId).filter((paneId): paneId is string => paneId != null).sort();
    const key = panes.join(",");
    if (this.#subscription != null && key === this.#subscribedPanes) return;
    this.#subscription?.close();
    this.#subscribedPanes = key;
    const subscriptions = [...GLOBAL_SUBSCRIPTIONS, ...panes.map((paneId) => ({ type: "pane.agent_status_changed", pane_id: paneId }))];
    this.#subscription = subscribeHerdrEvents(this.#deps.socketPath, subscriptions, {
      onEvent: () => this.#scheduleRefresh(),
      onClose: (error) => {
        this.#subscription = null;
        this.#subscribedPanes = "";
        if (this.#stopped) return;
        log("status-mirror", "herdr event subscription closed; polling until it comes back", error?.message);
        this.#resubscribeTimer = setTimeout(() => this.resubscribe(), this.#deps.resubscribeMs ?? 30_000);
        this.#resubscribeTimer.unref();
      },
    });
  }

  #scheduleRefresh(): void {
    if (this.#debounceTimer != null) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => void this.refresh(), this.#deps.debounceMs ?? 150);
    this.#debounceTimer.unref();
  }

  async #refreshOnce(): Promise<void> {
    let agents;
    try {
      agents = await this.#deps.cli.agentList();
    } catch (error) {
      log("status-mirror", "agent list failed", error instanceof Error ? error.message : String(error));
      return;
    }
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
