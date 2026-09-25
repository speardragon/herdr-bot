import type { HostConfig } from "./config.ts";
import { SayInbox } from "./bots/say-inbox.ts";
import { startControlServer, type ControlServer } from "./control/server.ts";
import { createControlHandler } from "./control/handlers.ts";
import { createHerdrCli, type HerdrCli } from "./herdr/cli.ts";
import { ensureHerdrSession, spawnHerdrSessionServer } from "./herdr/session.ts";
import { StatusMirror } from "./herdr/status-mirror.ts";
import { HostEvents } from "./host-events.ts";
import { log } from "./log.ts";
import { BotOnboardingService } from "./services/bot-onboarding-service.ts";
import { ChatService } from "./services/chat-service.ts";
import { PromptService, readBlockedPrompt } from "./services/prompt-service.ts";
import { PromptTracker } from "./services/prompt-tracker.ts";
import { RosterService } from "./services/roster-service.ts";
import { RunQueue } from "./services/run-queue.ts";
import { BotExecutionLock, TurnService } from "./services/turn-service.ts";
import { ProfileStore } from "./store/profile-store.ts";
import { RoomStore } from "./store/room-store.ts";
import type { StoredEntry } from "./store/transcript-store.ts";
import { ViewStateStore } from "./store/view-state-store.ts";

export interface SendUserMessageArgs {
  readonly content: string;
  readonly clientNonce?: string;
  readonly richText?: string;
  readonly replyTo?: string;
  readonly attachmentPaths?: readonly string[];
}

export interface HostStatus {
  readonly home: string;
  readonly session: string;
  readonly bots: number;
  readonly rooms: number;
  readonly runningTurns: readonly string[];
}

export interface Host {
  readonly config: HostConfig;
  readonly events: HostEvents;
  readonly roster: RosterService;
  readonly chat: ChatService;
  readonly turns: TurnService;
  readonly onboarding: BotOnboardingService;
  readonly mirror: StatusMirror;
  readonly prompts: PromptService;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendUserMessage(chatId: string, args: SendUserMessageArgs): StoredEntry;
  status(): HostStatus;
}

export interface HostOverrides {
  readonly cli?: HerdrCli;
  readonly socketPath?: string | null;
  readonly now?: () => number;
  /** How start() makes sure the herdr session exists; `null` skips it (tests against the fake herdr). */
  readonly ensureSession?: (() => Promise<string>) | null;
}

function withAttachments(content: string, paths: readonly string[] | undefined): string {
  if (paths == null || paths.length === 0) return content;
  return `${content}\n\n${paths.map((path) => `(attached: ${path})`).join("\n")}`;
}

interface HostServices {
  readonly cli: HerdrCli;
  readonly profiles: ProfileStore;
  readonly rooms: RoomStore;
  readonly events: HostEvents;
  readonly mirror: StatusMirror;
  readonly chat: ChatService;
  readonly roster: RosterService;
  readonly turns: TurnService;
  readonly onboarding: BotOnboardingService;
  readonly prompts: PromptService;
  readonly promptTracker: PromptTracker;
}

/** Constructs the stores plus the mirror/roster/chat/turn wiring, evicting per-chat caches on delete. */
function buildServices(config: HostConfig, overrides: HostOverrides): HostServices {
  const cli = overrides.cli ?? createHerdrCli(config.herdrBin, process.env, config.herdrSession);
  const profiles = new ProfileStore(config.home);
  const rooms = new RoomStore(config.home);
  const view = new ViewStateStore(config.home);
  const events = new HostEvents();
  const runQueue = new RunQueue();
  const inbox = new SayInbox();
  let chatRef: ChatService | null = null;
  let turnsRef: TurnService | null = null;
  let promptsRef: PromptService | null = null;
  let promptTrackerRef: PromptTracker | null = null;

  const mirror = new StatusMirror({
    cli,
    socketPath: overrides.socketPath === undefined ? config.herdrSocketPath : overrides.socketPath,
    botIds: () => profiles.list().map((profile) => profile.id),
    onChange: (botId, runtime, previous) => {
      // The prompt card entry is appended/updated first so the upsert that follows already sees it.
      promptTrackerRef?.onRuntimeChange(botId, runtime, previous);
      chatRef?.emitUpsert(botId);
    },
    readPrompt: (botId) => readBlockedPrompt(cli, botId),
    isPromptReadSuppressed: (botId) => promptsRef?.isAnswering(botId) ?? false,
  });
  const prompts = new PromptService({ cli, mirror, onAnswered: (botId, answer, prompt) => promptTrackerRef?.recordAnswer(botId, answer, prompt) });
  promptsRef = prompts;
  const chat = new ChatService({ config, profiles, rooms, view, mirror, events, isTurnActive: (chatId) => turnsRef?.isTurnActive(chatId) ?? false, ...(overrides.now == null ? {} : { now: overrides.now }) });
  chatRef = chat;
  const promptTracker = new PromptTracker({ chat, inbox, profiles });
  promptTrackerRef = promptTracker;
  const roster = new RosterService({
    config, profiles, rooms, cli, mirror,
    ...(overrides.now == null ? {} : { now: overrides.now }),
    onNotice: (chatId, text) => chat.appendNotice(chatId, text),
    onBotEvent: (chatId, event) => chat.appendBotEvent(chatId, event),
    onChatRemoved: (chatId) => {
      chat.forget(chatId);
      view.delete(chatId);
      runQueue.forget(chatId);
    },
  });
  const botLocks = new BotExecutionLock();
  const turns = new TurnService({ config, roster, chat, runQueue, cli, mirror, inbox }, botLocks);
  turnsRef = turns;
  const onboarding = new BotOnboardingService({ config, profiles, roster, chat, turns, ...(overrides.now == null ? {} : { now: overrides.now }) });
  return { cli, profiles, rooms, events, mirror, chat, roster, turns, onboarding, prompts, promptTracker };
}

function defaultEnsureSession(config: HostConfig, cli: HerdrCli): () => Promise<string> {
  return () => ensureHerdrSession({
    session: config.herdrSession,
    sessionList: () => cli.sessionList(),
    spawnServer: () => spawnHerdrSessionServer(config.herdrBin, config.herdrSession),
  });
}

export function createHost(config: HostConfig, overrides: HostOverrides = {}): Host {
  const { cli, profiles, rooms, events, mirror, chat, roster, turns: turnService, onboarding, prompts, promptTracker } = buildServices(config, overrides);
  const ensureSession = overrides.ensureSession === undefined ? defaultEnsureSession(config, cli) : overrides.ensureSession;

  let controlServer: ControlServer | null = null;
  const host: Host = {
    config,
    events,
    roster,
    chat,
    turns: turnService,
    onboarding,
    mirror,
    prompts,
    async start() {
      onboarding.recover();
      controlServer = await startControlServer(config.controlSocketPath, createControlHandler(host));
      if (ensureSession != null) {
        try {
          const socketPath = await ensureSession();
          log("host", `herdr session "${config.herdrSession}" ready at ${socketPath}`);
        } catch (error) {
          log("host", `herdr session "${config.herdrSession}" is unavailable; bot commands will fail until it starts`, error instanceof Error ? error.message : String(error));
        }
      }
      // One real refresh before prompt-card reconciliation: `onRuntimeChange` (fired synchronously for
      // every bot whose runtime differs from the pre-start empty state) already reconciles most bots
      // against a card the previous run left `pending`; `promptTracker.recover` then sweeps only the
      // ones that stayed fully offline throughout this refresh and so never reached that callback.
      await mirror.refresh();
      promptTracker.recover(mirror);
      mirror.start();
      log("host", `listening on ${config.controlSocketPath}`);
    },
    async stop() {
      onboarding.stop();
      mirror.stop();
      // Drain a refresh that was still in flight from start()'s initial mirror.start() call
      // (StatusMirror.refresh() dedupes onto that same in-flight promise), so it settles while
      // the config.home directory is still guaranteed to exist instead of failing after teardown.
      await mirror.refresh();
      await controlServer?.close();
      controlServer = null;
    },
    sendUserMessage(chatId, args) {
      const entry = chat.appendUser(chatId, {
        content: withAttachments(args.content, args.attachmentPaths),
        ...(args.clientNonce == null ? {} : { clientNonce: args.clientNonce }),
        ...(args.richText == null ? {} : { richText: args.richText }),
        ...(args.replyTo == null ? {} : { replyTo: args.replyTo }),
      });
      void turnService.schedule(chatId);
      return entry;
    },
    status() {
      return { home: config.home, session: config.herdrSession, bots: profiles.list().length, rooms: rooms.list().length, runningTurns: [...profiles.list().map((p) => p.id), ...rooms.list().map((r) => r.id)].filter((id) => turnService.isTurnActive(id)) };
    },
  };
  return host;
}
