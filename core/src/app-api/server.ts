/**
 * The host-facing half of the app API: a method table over `Host` plus a bridge from `HostEvents` to
 * the typed `AppApiEvent` stream. The returned `AppApiServer` already satisfies `AppApiTransport`'s
 * shape (`call`/`subscribe`), so `in-memory-transport.ts` can wrap it directly for tests, and a real
 * transport (desktop ipc) just forwards to it from the main process.
 */
import type { Host } from "../host.ts";
import { PromptError } from "../services/prompt-service.ts";
import { RosterError } from "../services/roster-service.ts";
import { AppApiError, isAppApiError } from "./errors.ts";
import * as botHandlers from "./handlers/bot.ts";
import * as chatHandlers from "./handlers/chat.ts";
import * as settingsHandlers from "./handlers/settings.ts";
import { toChatSummary, toTranscriptEntry } from "./mapping.ts";
import type { AppApiEvent, AppApiEventMap, AppApiEventType, AppApiMethod } from "./types.ts";

type Handler = (host: Host, params: unknown) => unknown | Promise<unknown>;

const METHOD_TABLE: Readonly<Record<AppApiMethod, Handler>> = {
  "chat.list": (host) => chatHandlers.listChats(host),
  "chat.search": (host, params) => chatHandlers.searchChats(host, params),
  "chat.updateProfile": (host, params) => chatHandlers.updateChatProfile(host, params),
  "chat.setUnread": (host, params) => chatHandlers.setChatUnread(host, params),
  "chat.markRead": (host, params) => chatHandlers.markChatRead(host, params),
  "chat.setHidden": (host, params) => chatHandlers.setChatHidden(host, params),
  "chat.setNotifyOnUpdates": (host, params) => chatHandlers.setChatNotifyOnUpdates(host, params),
  "chat.delete": (host, params) => chatHandlers.deleteChats(host, params),

  "transcript.page": (host, params) => chatHandlers.transcriptPage(host, params),
  "transcript.thread": (host, params) => chatHandlers.transcriptThread(host, params),

  "message.send": (host, params) => chatHandlers.sendMessage(host, params),
  "message.react": (host, params) => chatHandlers.reactToMessage(host, params),
  "message.search": (host, params) => chatHandlers.searchMessagesHandler(host, params),

  "bot.create": (host, params) => botHandlers.createBot(host, params),
  "bot.quickCreate": (host, params) => botHandlers.quickCreateBot(host, params),
  "bot.retrySetup": (host, params) => botHandlers.retrySetup(host, params),
  "bot.updateLaunchSettings": (host, params) => botHandlers.updateLaunchSettings(host, params),
  "bot.focus": (host, params) => botHandlers.focusBot(host, params),
  "bot.listAdoptable": (host) => botHandlers.listAdoptable(host),
  "bot.listModels": (host, params) => botHandlers.listModels(host, params),
  "bot.defaults": (host) => botHandlers.botDefaults(host),

  "room.create": (host, params) => botHandlers.createRoom(host, params),
  "room.setMembers": (host, params) => botHandlers.setRoomMembers(host, params),

  "prompt.answer": (host, params) => botHandlers.answerPrompt(host, params),

  "directory.list": (host, params) => settingsHandlers.listDirectoriesHandler(host, params),

  "settings.get": (host) => settingsHandlers.getAppSettings(host),
  "settings.update": (host, params) => settingsHandlers.updateAppSettings(host, params),

  "identity.get": (host) => settingsHandlers.getIdentity(host),
  "host.status": (host) => settingsHandlers.getHostStatus(host),
};

function toAppApiError(error: unknown): AppApiError {
  if (isAppApiError(error)) return error;
  if (error instanceof RosterError) return new AppApiError(error.code, error.message);
  if (error instanceof PromptError) return new AppApiError(error.code, error.message);
  return new AppApiError("internal", error instanceof Error ? error.message : String(error));
}

export interface AppApiServer {
  call(method: string, params: unknown): Promise<unknown>;
  /** Delivers every event, of every type, to `onEvent`; returns an unsubscribe function. Safe to call
   * more than once -- every subscriber gets every event. */
  subscribe(onEvent: (event: AppApiEvent) => void): () => void;
  /** Stops bridging HostEvents into AppApiEvents (used by tests; the desktop process normally lives as
   * long as the host does and never needs this). */
  close(): void;
}

export function createAppApiServer(host: Host): AppApiServer {
  const listeners = new Set<(event: AppApiEvent) => void>();
  let seq = 0;

  function publish<K extends AppApiEventType>(type: K, payload: AppApiEventMap[K]): void {
    seq += 1;
    const event: AppApiEvent = { seq, type, payload };
    for (const listener of listeners) listener(event);
  }

  const offAgents = host.events.on("agents", (payload) => {
    publish("chat.listChanged", (payload as Parameters<typeof toChatSummary>[0][]).map(toChatSummary));
  });
  const offUpserted = host.events.on("agent-upserted", (payload) => {
    publish("chat.changed", toChatSummary(payload as Parameters<typeof toChatSummary>[0]));
  });
  const offTranscript = host.events.on("transcript", (payload) => {
    const event = payload as { readonly type: "appended" | "updated"; readonly agentId: string; readonly entry: Parameters<typeof toTranscriptEntry>[0] };
    publish(event.type === "appended" ? "transcript.entryAppended" : "transcript.entryUpdated", { chatId: event.agentId, entry: toTranscriptEntry(event.entry) });
  });

  return {
    async call(method, params) {
      const handler = METHOD_TABLE[method as AppApiMethod];
      if (handler == null) throw new AppApiError("unknown_method", `no app-api method "${method}"`);
      try {
        return await handler(host, params);
      } catch (error) {
        throw toAppApiError(error);
      }
    },
    subscribe(onEvent) {
      listeners.add(onEvent);
      return () => listeners.delete(onEvent);
    },
    close() {
      offAgents();
      offUpserted();
      offTranscript();
      listeners.clear();
    },
  };
}
