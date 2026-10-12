/**
 * Transport-agnostic request/response/event types for herdr-bot's app API -- the contract between the
 * host (core/src/app-api/server.ts) and any UI (today: the Electron renderer, over desktop/src's ipc
 * wiring). Zero imports, zero runtime dependencies: a renderer bundles this file directly.
 *
 * See docs/app-api.md for the full reference (every method's args/result, every event, error codes).
 */

// ---------------------------------------------------------------------------------------------------
// Shared domain shapes
// ---------------------------------------------------------------------------------------------------

export type ChatKind = "bot" | "room";
export type PermissionMode = "ask" | "auto";
/** A terminal "Open in herdr" can open a tab in. */
export type Terminal = "kaku" | "wezterm" | "ghostty" | "iterm" | "terminal";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type OnboardingStage = "provisioning" | "briefing" | "greeting" | "ready" | "failed";
export type OnboardingLocale = "ko" | "en";
export type AwaitingReason = "approval" | "offline" | "setup";
export type BotStatus = "idle" | "working" | "blocked" | "done" | "unknown" | "offline";

export interface BotOnboardingState {
  readonly requestId: string;
  readonly locale: OnboardingLocale;
  readonly stage: OnboardingStage;
  readonly error: string | null;
}

export interface PendingPromptOption {
  readonly key: string;
  readonly label: string;
  readonly detail: string | null;
  readonly selected: boolean;
  readonly checked: boolean | null;
}

/** A bot's blocked approval/question form, parsed from its terminal so the UI can render + answer it
 * inline (see `prompt.answer`). Mirrors `core/src/herdr/blocked-prompt.ts`'s `BlockedPrompt`. */
export interface PendingPrompt {
  readonly kind: "permission" | "question" | "unknown";
  readonly title: string | null;
  readonly header: string | null;
  readonly progress: { readonly done: number; readonly total: number } | null;
  readonly question: string;
  readonly body: readonly string[];
  readonly options: readonly PendingPromptOption[];
  readonly multiSelect: boolean;
  readonly freeTextKey: string | null;
  readonly signature: string;
}

/** Everything about a bot beyond what a room also has: provider/runtime/launch settings. Null on a
 * room's ChatSummary. */
export interface BotFacts {
  readonly provider: string | null;
  readonly status: BotStatus;
  readonly paneId: string | null;
  readonly cwd: string | null;
  readonly adopted: boolean;
  readonly permissionMode: PermissionMode;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly onboarding: BotOnboardingState | null;
  readonly pendingPrompt: PendingPrompt | null;
}

/** One row in the chat list (sidebar): a bot DM or a room, with everything needed to render it without
 * a follow-up call. */
export interface ChatSummary {
  readonly id: string;
  readonly kind: ChatKind;
  readonly name: string;
  readonly description: string;
  readonly title: string;
  readonly avatarShape: string | null;
  readonly avatarColor: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly isRunning: boolean;
  readonly currentActivity: { readonly verb: "working" } | null;
  readonly lastMessagePreview: string | null;
  readonly lastMessageId: string | null;
  readonly hasUnread: boolean;
  readonly unreadCount: number;
  readonly lastViewedAt: number;
  readonly lastActivityAt: number;
  readonly lastReadSeq: number;
  readonly lastIncomingSeq: number;
  readonly lastMessageAt: number;
  readonly awaitingUserResponse: { readonly reason: AwaitingReason } | null;
  readonly notifyOnUpdatesEnabled: boolean;
  readonly isHiddenFromSidebar: boolean;
  readonly isGroup: boolean;
  readonly memberIds: readonly string[];
  readonly bot: BotFacts | null;
}

/** One transcript row. Open-ended by design (mirrors the host's `StoredEntry`): common `kind`s are
 * "message" (user), "send-message" (bot reply), "notice", "prompt" (an inline `PendingPrompt` card,
 * `entry.prompt`/`entry.status`). See docs/app-api.md for the field layout of each kind. */
export interface TranscriptEntry {
  readonly id: string;
  readonly kind: string;
  readonly seq: number;
  readonly timestampMs: number;
  readonly [key: string]: unknown;
}

export interface TranscriptPage {
  readonly entries: readonly TranscriptEntry[];
  readonly nextBeforeSeq?: number;
}

export interface MessageSearchHit {
  readonly chatId: string;
  readonly chatName: string;
  readonly entryId: string;
  readonly role: "user" | "assistant";
  readonly author: string;
  readonly timestampMs: number;
  readonly snippet: string;
}

export interface AdoptableAgent {
  readonly name: string | null;
  readonly provider: string | null;
  readonly status: "idle" | "working" | "blocked" | "done" | "unknown";
  readonly paneId: string;
  readonly cwd: string | null;
}

export type ModelCatalogSource = "installed-cli" | "latest-alias" | "user-fallback" | "unavailable";

export interface ModelEntry {
  readonly id: string;
  readonly label: string;
}

export interface ModelCatalogResult {
  readonly models: readonly ModelEntry[];
  readonly source: ModelCatalogSource;
  readonly error?: string;
}

export interface DirectoryListing {
  readonly exists: boolean;
  /** Whether the resolved path is exactly the user's home directory -- gates the "this is your home
   * folder, are you sure?" confirmation before `bot.create`/`bot.updateLaunchSettings`. */
  readonly isHome: boolean;
  readonly entries: readonly string[];
}

export interface AppSettings {
  readonly defaultWorkingFolder: string | null;
  readonly defaultProvider: string | null;
  readonly defaultPermissionMode: PermissionMode | null;
  /** The terminal "Open in herdr" uses; `null` picks a running one. */
  readonly terminal: Terminal | null;
}

export interface BotDefaults {
  readonly cwd: string;
  readonly provider: string;
  readonly permissionMode: PermissionMode;
  readonly homeDir: string;
}

export interface HostStatusSummary {
  readonly home: string;
  readonly session: string;
  readonly bots: number;
  readonly rooms: number;
  readonly runningChatIds: readonly string[];
}

// ---------------------------------------------------------------------------------------------------
// Method table: every call the UI can make. `params: void` methods are called with `undefined`.
// ---------------------------------------------------------------------------------------------------

export interface CreateBotParams {
  readonly name: string;
  readonly id?: string;
  readonly description?: string;
  readonly provider?: string;
  readonly cwd?: string;
  readonly permissionMode?: PermissionMode;
  readonly model?: string | null;
  readonly reasoningEffort?: ReasoningEffort | null;
  readonly avatarShape?: string | null;
  readonly avatarColor?: string | null;
  /** Set to adopt an existing herdr pane (by its pane id) as this bot instead of spawning a new one. */
  readonly adoptPaneId?: string;
  readonly allowHomeCwd?: boolean;
}

export interface AppApiMethods {
  "chat.list": { params: void; result: ChatSummary[] };
  "chat.search": { params: { readonly query?: string }; result: ChatSummary[] };
  "chat.updateProfile": {
    params: { readonly chatId: string; readonly name?: string; readonly description?: string; readonly title?: string; readonly avatarShape?: string | null; readonly avatarColor?: string | null };
    result: ChatSummary | null;
  };
  "chat.setUnread": { params: { readonly chatId: string; readonly isUnread: boolean }; result: void };
  "chat.markRead": { params: { readonly chatId: string; readonly throughSeq: number }; result: { readonly lastReadSeq: number } };
  "chat.setHidden": { params: { readonly chatId: string; readonly isHidden: boolean }; result: void };
  "chat.setNotifyOnUpdates": { params: { readonly chatId: string; readonly isEnabled: boolean }; result: ChatSummary | null };
  "chat.delete": { params: { readonly chatIds: readonly string[] }; result: { readonly deletedIds: readonly string[] } };

  "transcript.page": { params: { readonly chatId: string; readonly limit?: number; readonly beforeSeq?: number }; result: TranscriptPage };
  "transcript.thread": { params: { readonly chatId: string; readonly rootId: string }; result: { readonly entries: readonly TranscriptEntry[] } };

  "message.send": {
    params: { readonly chatId: string; readonly text: string; readonly richText?: string; readonly replyTo?: string; readonly attachmentPaths?: readonly string[]; readonly clientNonce?: string };
    result: { readonly entryId: string };
  };
  "message.react": { params: { readonly chatId: string; readonly entryId: string; readonly emoji: string }; result: { readonly entry: TranscriptEntry | null } };
  "message.search": { params: { readonly query?: string }; result: readonly MessageSearchHit[] };

  "bot.create": { params: CreateBotParams; result: { readonly chat: ChatSummary } };
  "bot.quickCreate": { params: { readonly requestId: string; readonly locale: OnboardingLocale; readonly name?: string; readonly avatarColor?: string }; result: { readonly chat: ChatSummary } };
  "bot.retrySetup": { params: { readonly botId: string }; result: { readonly chat: ChatSummary } };
  "bot.updateLaunchSettings": {
    /** `permissionMode`, like `model`/`reasoningEffort`, distinguishes an absent key (keep the bot's
     * current mode) from an explicit `null` (reset to the host's effective default permission mode --
     * "use the agent's own default approval policy"). */
    params: { readonly botId: string; readonly cwd?: string; readonly permissionMode?: PermissionMode | null; readonly model?: string | null; readonly reasoningEffort?: ReasoningEffort | null; readonly allowHomeCwd?: boolean };
    result: { readonly chat: ChatSummary };
  };
  "bot.focus": { params: { readonly botId: string }; result: void };
  "bot.listAdoptable": { params: void; result: readonly AdoptableAgent[] };
  "bot.listModels": { params: { readonly provider: string }; result: ModelCatalogResult };
  "bot.defaults": { params: void; result: BotDefaults };

  "room.create": { params: { readonly name: string; readonly description?: string; readonly memberIds: readonly string[]; readonly requestId?: string }; result: { readonly chat: ChatSummary } };
  "room.setMembers": { params: { readonly roomId: string; readonly memberIds: readonly string[] }; result: ChatSummary | null };

  "prompt.answer": {
    params: { readonly botId: string; readonly signature: string; readonly action: "option" | "text" | "next" | "cancel"; readonly key?: string; readonly text?: string };
    result: { readonly chat: ChatSummary };
  };

  "directory.list": { params: { readonly path?: string }; result: DirectoryListing };

  "settings.get": { params: void; result: AppSettings };
  "settings.update": { params: Partial<AppSettings>; result: AppSettings };

  "identity.get": { params: void; result: { readonly userName: string } };
  "host.status": { params: void; result: HostStatusSummary };
}

export type AppApiMethod = keyof AppApiMethods;
export type AppApiParams<M extends AppApiMethod> = AppApiMethods[M]["params"];
export type AppApiResult<M extends AppApiMethod> = AppApiMethods[M]["result"];

// ---------------------------------------------------------------------------------------------------
// Events: pushed by the host, never requested. Every event carries a host-assigned, monotonically
// increasing `seq` (shared across every event type) so a client can detect a gap (e.g. after its
// transport reconnected) and fall back to re-querying `chat.list`/`transcript.page` instead of assuming
// its local state is still current. There is no replay buffer -- a missed event is gone, by design.
// ---------------------------------------------------------------------------------------------------

export interface AppApiEventMap {
  /** The full chat list changed shape (a chat was created/deleted, or membership changed) -- a client
   * should treat this as the new source of truth for the sidebar rather than patching one row. */
  "chat.listChanged": readonly ChatSummary[];
  /** One chat's summary changed (new message, read state, profile edit, status, prompt, etc). */
  "chat.changed": ChatSummary;
  "transcript.entryAppended": { readonly chatId: string; readonly entry: TranscriptEntry };
  "transcript.entryUpdated": { readonly chatId: string; readonly entry: TranscriptEntry };
}

export type AppApiEventType = keyof AppApiEventMap;

export interface AppApiEvent<K extends AppApiEventType = AppApiEventType> {
  readonly seq: number;
  readonly type: K;
  readonly payload: AppApiEventMap[K];
}

// ---------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------

export type AppApiErrorCode =
  | "invalid_args"
  | "unknown_method"
  | "internal"
  | "invalid_bot_id"
  | "bot_exists"
  | "unknown_bot"
  | "unknown_room"
  | "unknown_chat"
  | "too_many_members"
  | "unsupported_kind"
  | "invalid_launch_options"
  | "herdr_error"
  | "bot_not_ready"
  | "missing_cwd"
  | "home_cwd_requires_confirmation"
  | "not_blocked"
  | "prompt_changed"
  | "invalid_answer"
  | "answer_in_flight";

export interface AppApiErrorPayload {
  readonly code: AppApiErrorCode;
  readonly message: string;
}
