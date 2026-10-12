/**
 * An in-browser fake implementing `AppApiTransport` (call/subscribe) over the demo dataset
 * (demo-data.ts), so `npm run renderer:dev` + `?demo` works without Electron/a real host. Not a
 * faithful host re-implementation -- just enough of each method for every feature to build and
 * test against real-shaped data (see docs/app-api.md for what each method is supposed to do).
 *
 * Internals are loosely typed on purpose (`Record<string, (params: any) => unknown>`): this file's only
 * contract that matters to the rest of the app is the exported `AppApiTransport` shape at the bottom,
 * which *is* strictly typed -- mirroring the strictness of `AppApiMethods` for every one of ~25 method
 * bodies here would add a lot of ceremony for code that exists only to feed a dev harness.
 */
import { AppApiError } from "../data/types.ts";
import type { AppApiEvent, AppApiEventType, AppApiTransport, AppSettings, ChatSummary, TranscriptEntry } from "../data/types.ts";
import { DEMO_CHATS, DEMO_TRANSCRIPTS } from "./demo-data.ts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createFakeAppApi(): AppApiTransport {
  const chats = new Map<string, ChatSummary>(DEMO_CHATS.map((chat) => [chat.id, clone(chat)]));
  const transcripts = new Map<string, TranscriptEntry[]>(Object.entries(DEMO_TRANSCRIPTS).map(([id, entries]) => [id, clone([...entries])]));
  let settings: AppSettings = { defaultWorkingFolder: null, defaultProvider: null, defaultPermissionMode: "ask", terminal: null };

  let eventSeq = 0;
  const listeners = new Set<(event: AppApiEvent) => void>();

  function emit(type: AppApiEventType, payload: unknown): void {
    eventSeq += 1;
    for (const listener of listeners) listener({ seq: eventSeq, type, payload } as AppApiEvent);
  }

  function requireChat(chatId: string): ChatSummary {
    const chat = chats.get(chatId);
    if (chat == null) throw new AppApiError("unknown_chat", `no such chat: ${chatId}`);
    return chat;
  }

  function putChat(next: ChatSummary): ChatSummary {
    chats.set(next.id, next);
    emit("chat.changed", next);
    return next;
  }

  function nextEntrySeq(chatId: string): number {
    const entries = transcripts.get(chatId) ?? [];
    return (entries[entries.length - 1]?.seq ?? 0) + 1;
  }

  function blankChat(overrides: Partial<ChatSummary> & Pick<ChatSummary, "id" | "kind" | "name">): ChatSummary {
    const now = Date.now();
    return {
      description: "",
      title: "",
      avatarShape: null,
      avatarColor: null,
      createdAt: now,
      updatedAt: now,
      isRunning: false,
      currentActivity: null,
      lastMessagePreview: null,
      lastMessageId: null,
      hasUnread: false,
      unreadCount: 0,
      lastViewedAt: now,
      lastActivityAt: now,
      lastReadSeq: 0,
      lastIncomingSeq: 0,
      lastMessageAt: now,
      awaitingUserResponse: null,
      notifyOnUpdatesEnabled: true,
      isHiddenFromSidebar: false,
      isGroup: overrides.kind === "room",
      memberIds: [],
      bot: null,
      ...overrides,
    };
  }

  const methods: Record<string, (params: any) => unknown> = {
    "chat.list": () => [...chats.values()],
    "chat.search": (params: { query?: string }) => {
      const needle = (params.query ?? "").toLowerCase();
      return [...chats.values()].filter((chat) => needle.length === 0 || chat.name.toLowerCase().includes(needle) || chat.description.toLowerCase().includes(needle));
    },
    "chat.updateProfile": (params) => {
      const chat = requireChat(params.chatId);
      return putChat({
        ...chat,
        name: params.name ?? chat.name,
        description: params.description ?? chat.description,
        title: params.title ?? chat.title,
        avatarShape: params.avatarShape === undefined ? chat.avatarShape : params.avatarShape,
        avatarColor: params.avatarColor === undefined ? chat.avatarColor : params.avatarColor,
      });
    },
    "chat.setUnread": (params) => {
      const chat = requireChat(params.chatId);
      putChat({ ...chat, hasUnread: params.isUnread, unreadCount: params.isUnread ? 1 : 0 });
    },
    "chat.markRead": (params) => {
      const chat = requireChat(params.chatId);
      putChat({ ...chat, hasUnread: false, unreadCount: 0, lastReadSeq: params.throughSeq });
      return { lastReadSeq: params.throughSeq };
    },
    "chat.setHidden": (params) => {
      const chat = requireChat(params.chatId);
      putChat({ ...chat, isHiddenFromSidebar: params.isHidden });
    },
    "chat.setNotifyOnUpdates": (params) => {
      const chat = requireChat(params.chatId);
      return putChat({ ...chat, notifyOnUpdatesEnabled: params.isEnabled });
    },
    "chat.delete": (params: { chatIds: readonly string[] }) => {
      for (const id of params.chatIds) chats.delete(id);
      emit("chat.listChanged", [...chats.values()]);
      return { deletedIds: [...params.chatIds] };
    },

    "transcript.page": (params: { chatId: string; limit?: number; beforeSeq?: number }) => {
      const entries = transcripts.get(params.chatId) ?? [];
      const windowed = params.beforeSeq == null ? entries : entries.filter((entry) => entry.seq < params.beforeSeq!);
      const limit = params.limit ?? 200;
      const page = windowed.slice(Math.max(0, windowed.length - limit));
      const hasMore = windowed.length > page.length;
      return { entries: page, nextBeforeSeq: hasMore ? page[0]?.seq : undefined };
    },
    "transcript.thread": (params: { chatId: string; rootId: string }) => {
      const entries = transcripts.get(params.chatId) ?? [];
      const root = entries.find((entry) => entry.id === params.rootId);
      const replies = entries.filter((entry) => (entry as { replyTo?: string }).replyTo === params.rootId);
      return { entries: root == null ? replies : [root, ...replies] };
    },

    "message.send": (params: { chatId: string; text: string; richText?: string; replyTo?: string; attachmentPaths?: readonly string[]; clientNonce?: string }) => {
      const chat = requireChat(params.chatId);
      const entries = transcripts.get(params.chatId) ?? [];
      // Mirror the real host (core/src/host.ts's `withAttachments` + `sendMessage`'s `sendUserMessage`
      // call): attachments are appended as plain `(attached: <path>)` trailing lines onto `content` (no
      // dedicated entry field), while `richText`/`replyTo` are spread onto the entry only when present, so
      // this dev harness exercises the exact same shape the conversation slice's `attachments.ts`/
      // `rich-text.ts`/`ReplyQuote.tsx` already parse against the real Electron host.
      const content = params.attachmentPaths != null && params.attachmentPaths.length > 0 ? `${params.text}\n\n${params.attachmentPaths.map((path) => `(attached: ${path})`).join("\n")}` : params.text;
      const entry: TranscriptEntry = {
        id: `demo-sent-${Date.now()}`,
        kind: "message",
        seq: nextEntrySeq(params.chatId),
        timestampMs: Date.now(),
        content,
        author: { id: "user", name: "Me" },
        ...(params.richText == null ? {} : { richText: params.richText }),
        ...(params.replyTo == null ? {} : { replyTo: params.replyTo }),
      };
      transcripts.set(params.chatId, [...entries, entry]);
      emit("transcript.entryAppended", { chatId: params.chatId, entry });
      putChat({ ...chat, lastMessagePreview: params.text, lastMessageAt: entry.timestampMs, lastActivityAt: entry.timestampMs });
      return { entryId: entry.id };
    },
    "message.react": (params: { chatId: string; entryId: string; emoji: string }) => {
      const entries = transcripts.get(params.chatId) ?? [];
      const index = entries.findIndex((entry) => entry.id === params.entryId);
      if (index === -1) return { entry: null };
      const entry = entries[index]!;
      const reactions = ((entry as { reactions?: { emoji: string; by: string }[] }).reactions) ?? [];
      const already = reactions.some((r) => r.emoji === params.emoji && r.by === "me");
      const nextReactions = already ? reactions.filter((r) => !(r.emoji === params.emoji && r.by === "me")) : [...reactions, { emoji: params.emoji, by: "me" }];
      const nextEntry = { ...entry, reactions: nextReactions };
      const nextEntries = [...entries];
      nextEntries[index] = nextEntry;
      transcripts.set(params.chatId, nextEntries);
      emit("transcript.entryUpdated", { chatId: params.chatId, entry: nextEntry });
      return { entry: nextEntry };
    },
    "message.search": (params: { query?: string }) => {
      const needle = (params.query ?? "").toLowerCase();
      if (needle.length === 0) return [];
      const hits: unknown[] = [];
      for (const [chatId, entries] of transcripts) {
        const chat = chats.get(chatId);
        for (const entry of entries) {
          const record = entry as Record<string, unknown>;
          const message = record.message as { content?: string } | undefined;
          const text = String(record.content ?? message?.content ?? "");
          if (text.toLowerCase().includes(needle)) {
            const author = record.author as { name?: string } | undefined;
            hits.push({ chatId, chatName: chat?.name ?? chatId, entryId: entry.id, role: entry.kind === "message" ? "user" : "assistant", author: author?.name ?? "", timestampMs: entry.timestampMs, snippet: text.slice(0, 120) });
          }
        }
      }
      return hits.slice(0, 50);
    },

    "bot.create": (params) => {
      const id = params.id ?? String(params.name).toLowerCase().replace(/\s+/g, "-");
      const chat = blankChat({
        id,
        kind: "bot",
        name: params.name,
        description: params.description ?? "",
        avatarShape: params.avatarShape ?? null,
        avatarColor: params.avatarColor ?? null,
        bot: { provider: params.provider ?? "claude", status: "idle", paneId: null, cwd: params.cwd ?? null, adopted: params.adoptPaneId != null, permissionMode: params.permissionMode ?? "ask", model: params.model ?? null, reasoningEffort: params.reasoningEffort ?? null, onboarding: null, pendingPrompt: null },
      });
      chats.set(id, chat);
      emit("chat.listChanged", [...chats.values()]);
      return { chat };
    },
    "bot.quickCreate": (params: { requestId: string; name?: string; avatarColor?: string }) =>
      methods["bot.create"]!({ name: params.name ?? "New Bot", id: `bot-${params.requestId}`, avatarColor: params.avatarColor }),
    "bot.retrySetup": (params: { botId: string }) => ({ chat: requireChat(params.botId) }),
    "bot.updateLaunchSettings": (params) => {
      const chat = requireChat(params.botId);
      const bot = chat.bot!;
      return {
        chat: putChat({
          ...chat,
          bot: {
            ...bot,
            cwd: params.cwd ?? bot.cwd,
            // Mirrors the real host: an absent `permissionMode` keeps the bot's own mode, an explicit
            // `null` resets to the (fake) effective default ("ask", same as `bot.defaults()` below).
            permissionMode: "permissionMode" in params ? (params.permissionMode ?? "ask") : bot.permissionMode,
            model: "model" in params ? (params.model ?? null) : bot.model,
            reasoningEffort: "reasoningEffort" in params ? (params.reasoningEffort ?? null) : bot.reasoningEffort,
          },
        }),
      };
    },
    "bot.focus": () => {},
    "bot.listAdoptable": () => [],
    "bot.listModels": () => ({ models: [{ id: "sonnet", label: "Sonnet" }], source: "installed-cli" }),
    "bot.defaults": () => ({ cwd: "/Users/ray/work/shop", provider: "claude", permissionMode: "ask", homeDir: "/Users/ray" }),

    "room.create": (params: { name: string; description?: string; memberIds: readonly string[]; requestId?: string }) => {
      const id = `room-${params.requestId ?? Date.now()}`;
      const chat = blankChat({ id, kind: "room", name: params.name, description: params.description ?? "", memberIds: params.memberIds });
      chats.set(id, chat);
      emit("chat.listChanged", [...chats.values()]);
      return { chat };
    },
    "room.setMembers": (params: { roomId: string; memberIds: readonly string[] }) => {
      const chat = requireChat(params.roomId);
      return putChat({ ...chat, memberIds: params.memberIds });
    },

    "prompt.answer": (params: { botId: string; signature: string }) => {
      const chat = requireChat(params.botId);
      if (chat.bot?.pendingPrompt?.signature !== params.signature) throw new AppApiError("prompt_changed", "the prompt has moved on");
      return { chat: putChat({ ...chat, awaitingUserResponse: null, bot: { ...chat.bot, status: "idle", pendingPrompt: null } }) };
    },

    "directory.list": (params: { path?: string }) => ({ exists: (params.path ?? "").length > 0, isHome: false, entries: [] }),

    "settings.get": () => ({ ...settings }),
    "settings.update": (params: Partial<AppSettings>) => {
      settings = {
        defaultWorkingFolder: params.defaultWorkingFolder !== undefined ? params.defaultWorkingFolder : settings.defaultWorkingFolder,
        defaultProvider: params.defaultProvider !== undefined ? params.defaultProvider : settings.defaultProvider,
        defaultPermissionMode: params.defaultPermissionMode !== undefined ? params.defaultPermissionMode : settings.defaultPermissionMode,
        terminal: params.terminal !== undefined ? params.terminal : settings.terminal,
      };
      return { ...settings };
    },

    "identity.get": () => ({ userName: "Ray" }),
    "host.status": () => ({
      home: "/demo/.herdr-bot",
      session: "herdr-bot-demo",
      bots: [...chats.values()].filter((c) => c.kind === "bot").length,
      rooms: [...chats.values()].filter((c) => c.kind === "room").length,
      runningChatIds: [...chats.values()].filter((c) => c.isRunning).map((c) => c.id),
    }),
  };

  return {
    call: async (method, params) => {
      const handler = methods[method];
      if (handler == null) throw new AppApiError("unknown_method", `unknown method: ${method}`);
      return handler(params);
    },
    subscribe: (onEvent) => {
      listeners.add(onEvent);
      return () => listeners.delete(onEvent);
    },
  };
}
