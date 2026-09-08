import type { Host } from "../host.ts";
import { entryText, projectAuthor } from "../model/entries.ts";
import { RosterError } from "../services/roster-service.ts";
import type { PermissionMode } from "../store/profile-store.ts";
import type { ControlHandler } from "./server.ts";
import { ControlError, optionalString, optionalStringArray, requireString } from "./protocol.ts";

function permissionMode(value: unknown): PermissionMode | undefined {
  return value === "ask" || value === "auto" ? value : undefined;
}

function rethrow(error: unknown): never {
  if (error instanceof ControlError) throw error;
  if (error instanceof RosterError) throw new ControlError(error.code === "unknown_bot" ? "unknown_bot" : error.code === "unknown_room" ? "unknown_chat" : "invalid_params", `${error.code}: ${error.message}`);
  throw error;
}

export function createControlHandler(host: Host): ControlHandler {
  const summaryOf = (chatId: string) => {
    const summary = host.chat.summary(chatId);
    if (summary == null) throw new ControlError("unknown_chat", `no chat "${chatId}"`);
    return summary;
  };

  return async (method, params) => {
    try {
      switch (method) {
        case "say":
          return host.turns.handleSay(requireString(params, "paneId"), requireString(params, "chatId"), requireString(params, "text"));
        case "pass":
          host.turns.handlePass(requireString(params, "paneId"), requireString(params, "chatId"));
          return { ok: true };
        case "read": {
          const chatId = requireString(params, "chatId");
          summaryOf(chatId);
          const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 40;
          const entries = host.chat.tail(chatId, limit).entries.flatMap((entry) => {
            const text = entryText(entry);
            if (text == null) return [];
            const author = entry.kind === "notice" ? "system" : projectAuthor(entry.author)?.name ?? "?";
            return [{ id: entry.id, author, text, timestampMs: entry.timestampMs }];
          });
          return { entries };
        }
        case "rooms":
          return { rooms: host.chat.listSummaries().filter((s) => s.isGroup).map((s) => ({ id: s.id, name: s.name, memberIds: s.memberIds })) };
        case "whoami": {
          const bot = host.roster.resolveBotByPane(requireString(params, "paneId"));
          if (bot == null) throw new ControlError("unknown_pane", "this pane is not a herdr-bot bot");
          return { bot: { id: bot.id, name: bot.name } };
        }
        case "send": {
          const chatId = requireString(params, "chatId");
          summaryOf(chatId);
          return { entryId: host.sendUserMessage(chatId, { content: requireString(params, "text") }).id };
        }
        case "bot.create": {
          const profile = await host.roster.createBot({
            ...(optionalString(params, "id") == null ? {} : { id: optionalString(params, "id")! }),
            name: requireString(params, "name"),
            ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }),
            ...(optionalString(params, "kind") == null ? {} : { kind: optionalString(params, "kind")! }),
            ...(optionalString(params, "cwd") == null ? {} : { cwd: optionalString(params, "cwd")! }),
            ...(permissionMode(params.permissionMode) == null ? {} : { permissionMode: permissionMode(params.permissionMode)! }),
          });
          host.chat.emitRoster();
          return summaryOf(profile.id);
        }
        case "bot.adopt": {
          const profile = await host.roster.createBot({ id: requireString(params, "id"), name: optionalString(params, "name") ?? requireString(params, "id"), adoptPaneId: requireString(params, "paneId"), ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }) });
          host.chat.emitRoster();
          return summaryOf(profile.id);
        }
        case "bot.list":
          return { agents: host.chat.listSummaries() };
        case "bot.adoptable":
          return { agents: await host.roster.listAdoptable() };
        case "bot.delete": {
          const id = requireString(params, "id");
          await host.roster.deleteBot(id);
          host.chat.emitRoster();
          return { deletedIds: [id] };
        }
        case "room.create": {
          const room = host.roster.createRoom({ name: requireString(params, "name"), ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }), memberIds: optionalStringArray(params, "memberIds") ?? [] });
          host.chat.emitRoster();
          return summaryOf(room.id);
        }
        case "room.set-members": {
          const room = host.roster.setRoomMembers(requireString(params, "id"), optionalStringArray(params, "memberIds") ?? []);
          if (room == null) throw new ControlError("unknown_chat", "no such room");
          host.chat.emitUpsert(room.id);
          return summaryOf(room.id);
        }
        case "status":
          return host.status();
        default:
          throw new ControlError("unknown_method", `unknown control method "${method}"`);
      }
    } catch (error) {
      return rethrow(error);
    }
  };
}
