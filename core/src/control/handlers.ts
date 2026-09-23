import type { Host } from "../host.ts";
import type { ReasoningEffort } from "../bots/launch-args.ts";
import { entryText, projectAuthor } from "../model/entries.ts";
import { RosterError, type RosterErrorCode } from "../services/roster-service.ts";
import type { AgentSummary } from "../model/summaries.ts";
import type { PermissionMode } from "../store/profile-store.ts";
import type { ControlHandler } from "./server.ts";
import { ControlError, optionalString, optionalStringArray, requireString, type ControlErrorCode } from "./protocol.ts";

type Params = Record<string, unknown>;
type Handler = (host: Host, params: Params) => Promise<unknown> | unknown;

function permissionMode(value: unknown): PermissionMode | undefined {
  return value === "ask" || value === "auto" ? value : undefined;
}

function requireSummary(host: Host, chatId: string): AgentSummary {
  const summary = host.chat.summary(chatId);
  if (summary == null) throw new ControlError("unknown_chat", `no chat "${chatId}"`);
  return summary;
}

function say(host: Host, params: Params): unknown {
  return host.turns.handleSay(requireString(params, "paneId"), requireString(params, "chatId"), requireString(params, "text"));
}

function message(host: Host, params: Params): unknown {
  return host.turns.handleMessage(requireString(params, "paneId"), requireString(params, "chatId"), requireString(params, "text"));
}

function pass(host: Host, params: Params): unknown {
  host.turns.handlePass(requireString(params, "paneId"), requireString(params, "chatId"));
  return { ok: true };
}

function read(host: Host, params: Params): unknown {
  const chatId = requireString(params, "chatId");
  requireSummary(host, chatId);
  const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 40;
  const entries = host.chat.tail(chatId, limit).entries.flatMap((entry) => {
    const text = entryText(entry);
    if (text == null) return [];
    const author = entry.kind === "notice" ? "system" : projectAuthor(entry.author)?.name ?? "?";
    return [{ id: entry.id, author, text, timestampMs: entry.timestampMs }];
  });
  return { entries };
}

function rooms(host: Host): unknown {
  return { rooms: host.chat.listSummaries().filter((s) => s.isGroup).map((s) => ({ id: s.id, name: s.name, memberIds: s.memberIds })) };
}

function whoami(host: Host, params: Params): unknown {
  const bot = host.roster.resolveBotByPane(requireString(params, "paneId"));
  if (bot == null) throw new ControlError("unknown_pane", "this pane is not a herdr-bot bot");
  return { bot: { id: bot.id, name: bot.name } };
}

function send(host: Host, params: Params): unknown {
  const chatId = requireString(params, "chatId");
  requireSummary(host, chatId);
  return { entryId: host.sendUserMessage(chatId, { content: requireString(params, "text") }).id };
}

async function botCreate(host: Host, params: Params): Promise<unknown> {
  const profile = await host.roster.createBot({
    ...(optionalString(params, "id") == null ? {} : { id: optionalString(params, "id")! }),
    name: requireString(params, "name"),
    ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }),
    ...(optionalString(params, "kind") == null ? {} : { kind: optionalString(params, "kind")! }),
    ...(optionalString(params, "cwd") == null ? {} : { cwd: optionalString(params, "cwd")! }),
    ...(params.model == null ? {} : { model: requireString(params, "model") }),
    ...(params.reasoningEffort == null ? {} : { reasoningEffort: requireString(params, "reasoningEffort") as ReasoningEffort }),
    ...(permissionMode(params.permissionMode) == null ? {} : { permissionMode: permissionMode(params.permissionMode)! }),
  });
  host.chat.emitRoster();
  return requireSummary(host, profile.id);
}

async function botAdopt(host: Host, params: Params): Promise<unknown> {
  const profile = await host.roster.createBot({ id: requireString(params, "id"), name: optionalString(params, "name") ?? requireString(params, "id"), adoptPaneId: requireString(params, "paneId"), ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }) });
  host.chat.emitRoster();
  return requireSummary(host, profile.id);
}

async function botDelete(host: Host, params: Params): Promise<unknown> {
  const id = requireString(params, "id");
  await host.roster.deleteBot(id);
  host.chat.emitRoster();
  return { deletedIds: [id] };
}

function roomCreate(host: Host, params: Params): unknown {
  const room = host.roster.createRoom({ name: requireString(params, "name"), ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }), memberIds: optionalStringArray(params, "memberIds") ?? [] });
  host.chat.emitRoster();
  return requireSummary(host, room.id);
}

function roomSetMembers(host: Host, params: Params): unknown {
  const room = host.roster.setRoomMembers(requireString(params, "id"), optionalStringArray(params, "memberIds") ?? []);
  if (room == null) throw new ControlError("unknown_chat", "no such room");
  host.chat.emitUpsert(room.id);
  return requireSummary(host, room.id);
}

const METHOD_TABLE: Readonly<Record<string, Handler>> = {
  say,
  message,
  pass,
  read,
  rooms,
  whoami,
  send,
  "bot.create": botCreate,
  "bot.adopt": botAdopt,
  "bot.list": (host) => ({ agents: host.chat.listSummaries() }),
  "bot.adoptable": async (host) => ({ agents: await host.roster.listAdoptable() }),
  "bot.delete": botDelete,
  "room.create": roomCreate,
  "room.set-members": roomSetMembers,
  status: (host) => host.status(),
};

const ROSTER_ERROR_CODES: Readonly<Record<RosterErrorCode, ControlErrorCode>> = {
  herdr_error: "herdr_error",
  unknown_bot: "unknown_bot",
  unknown_room: "unknown_chat",
  bot_exists: "invalid_params",
  too_many_members: "invalid_params",
  unsupported_kind: "invalid_params",
  invalid_launch_options: "invalid_params",
  invalid_bot_id: "invalid_params",
  bot_not_ready: "invalid_params",
};

function rethrow(error: unknown): never {
  if (error instanceof ControlError) throw error;
  if (error instanceof RosterError) throw new ControlError(ROSTER_ERROR_CODES[error.code], `${error.code}: ${error.message}`);
  throw error;
}

export function createControlHandler(host: Host): ControlHandler {
  return async (method, params) => {
    try {
      const handler = METHOD_TABLE[method];
      if (handler == null) throw new ControlError("unknown_method", `unknown control method "${method}"`);
      return await handler(host, params);
    } catch (error) {
      return rethrow(error);
    }
  };
}
