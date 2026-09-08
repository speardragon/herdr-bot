import type { Host } from "../host.ts";
import { RosterError } from "../services/roster-service.ts";
import type { PermissionMode } from "../store/profile-store.ts";
import { COORDINATOR_INVALID_ARGS, COORDINATOR_UNKNOWN_METHOD, type CoordinatorReplyOutcome } from "./frames.ts";

type Args = Record<string, unknown>;

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ArgsError extends Error {}

function str(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) throw new ArgsError(`${key} must be a non-empty string`);
  return value;
}

function optStr(args: Args, key: string): string | undefined {
  return typeof args[key] === "string" && (args[key] as string).length > 0 ? (args[key] as string) : undefined;
}

function num(args: Args, key: string, fallback: number): number {
  return typeof args[key] === "number" && Number.isFinite(args[key]) ? (args[key] as number) : fallback;
}

function strArray(args: Args, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new ArgsError(`${key} must be an array of strings`);
  return value as string[];
}

const EMPTY_ARRAY_METHODS = new Set(["getAsyncTasks", "getAgentWorkflows", "getAgentAutomations", "listAllAutomations", "getTrays", "getSubagents", "getConversationOutline", "searchMedia"]);
const NULL_METHODS = new Set(["getForeverBoxStatus", "ensureForeverBox", "handBackForeverBox", "dismissTray", "clearTrays", "getCloudAgentInfo", "respondToWidget", "dismissWidget", "resolveLocalToolPermission", "resolveAutoReviewApproval", "submitSecret", "getListenerConnectUrl"]);
const FALSE_METHODS = new Set(["isAgentNetworkEnabled", "isGlobalSearchEnabled", "isEgressTunnelAvailable"]);
const OBJECT_STUBS: Readonly<Record<string, unknown>> = {
  getSharingState: { isEnabled: false, selfAuthId: null, pendingJoinRequests: [], rooms: [], typingUsers: [] },
  getListenerIntegrations: {},
  getAgentChannels: { channels: [] },
  connectChannel: { channels: [] },
  disconnectChannel: { channels: [] },
  refreshChannel: { channels: [] },
  getTeachRecordingStatus: { status: "idle" },
  getPluginSyncStatus: {},
  getSkillPublishTargets: {},
};

function ok(value: unknown): CoordinatorReplyOutcome {
  return { status: "ok", value };
}

function failed(code: string, message: string): CoordinatorReplyOutcome {
  return { status: "failed", failure: { code, message } };
}

export function createCoordinatorDispatcher(host: Host): (method: string, args: unknown) => Promise<CoordinatorReplyOutcome> {
  const summaryOrNull = (id: string) => host.chat.summary(id);
  const requireSummary = (id: string) => {
    const summary = host.chat.summary(id);
    if (summary == null) throw new ArgsError(`no chat "${id}"`);
    return summary;
  };

  const handle = async (method: string, raw: unknown): Promise<unknown> => {
    const args: Args = isRecord(raw) ? raw : {};
    if (EMPTY_ARRAY_METHODS.has(method)) return [];
    if (NULL_METHODS.has(method)) return null;
    if (FALSE_METHODS.has(method)) return false;
    if (method in OBJECT_STUBS) return OBJECT_STUBS[method];
    switch (method) {
      case "listAgents": return host.chat.listSummaries();
      case "countAgents": return host.chat.listSummaries().length;
      case "searchAgents": {
        const query = (optStr(args, "query") ?? "").toLowerCase();
        return host.chat.listSummaries().filter((s) => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query));
      }
      case "createAgent": {
        const bot = isRecord(args.herdrBot) ? args.herdrBot : {};
        const mode = bot.permissionMode === "ask" || bot.permissionMode === "auto" ? (bot.permissionMode as PermissionMode) : undefined;
        const profile = await host.roster.createBot({
          name: str(args, "name"),
          ...(optStr(bot, "id") == null ? {} : { id: optStr(bot, "id")! }),
          ...(optStr(args, "description") == null ? {} : { description: optStr(args, "description")! }),
          ...(optStr(bot, "kind") == null ? {} : { kind: optStr(bot, "kind")! }),
          ...(optStr(bot, "cwd") == null ? {} : { cwd: optStr(bot, "cwd")! }),
          ...(mode == null ? {} : { permissionMode: mode }),
          ...(optStr(bot, "adoptPaneId") == null ? {} : { adoptPaneId: optStr(bot, "adoptPaneId")! }),
          avatarShape: optStr(args, "avatarShape") ?? null,
          avatarColor: optStr(args, "avatarColor") ?? null,
        });
        host.chat.emitRoster();
        return { agent: requireSummary(profile.id), transcript: [] };
      }
      case "createGroup": {
        const room = host.roster.createRoom({ name: str(args, "name"), ...(optStr(args, "description") == null ? {} : { description: optStr(args, "description")! }), memberIds: strArray(args, "memberIds") });
        host.chat.emitRoster();
        return { agent: requireSummary(room.id), transcript: [] };
      }
      case "setGroupMembers": {
        const room = host.roster.setRoomMembers(str(args, "id"), strArray(args, "memberAgentIds"));
        if (room != null) host.chat.emitUpsert(room.id);
        return room == null ? null : summaryOrNull(room.id);
      }
      case "updateAgent": {
        const id = str(args, "id");
        const profile = isRecord(args.profile) ? args.profile : {};
        const patch = { ...(optStr(profile, "name") == null ? {} : { name: optStr(profile, "name")! }), ...(typeof profile.description === "string" ? { description: profile.description } : {}) };
        const updated = host.chat.chatKind(id) === "room" ? host.roster.updateRoom(id, patch) : host.roster.updateProfile(id, patch);
        if (updated != null) host.chat.emitUpsert(id);
        return updated == null ? null : summaryOrNull(id);
      }
      case "deleteAgents": {
        const ids = strArray(args, "ids");
        for (const id of ids) {
          if (host.chat.chatKind(id) === "room") host.roster.deleteRoom(id);
          else if (host.chat.chatKind(id) === "bot") await host.roster.deleteBot(id);
        }
        host.chat.emitRoster();
        return { deletedIds: ids };
      }
      case "duplicateAgent":
        throw new ArgsError("duplicating bots is not supported");
      case "openAgentTail": {
        const id = str(args, "id");
        requireSummary(id);
        host.chat.markViewed(id);
        return host.chat.tail(id, num(args, "limit", 200));
      }
      case "getAgentTranscriptTail": {
        const id = str(args, "id");
        requireSummary(id);
        return host.chat.tail(id, num(args, "limit", 200), typeof args.beforeSeq === "number" ? args.beforeSeq : undefined);
      }
      case "getAgentTranscriptWindow": {
        const id = str(args, "id");
        requireSummary(id);
        return { ...host.chat.tail(id, num(args, "limit", 200), typeof args.beforeSeq === "number" ? args.beforeSeq : undefined), threadCounts: {} };
      }
      case "getAgentThread":
        return { entries: host.chat.thread(str(args, "id"), str(args, "rootId")) };
      case "sendPrompt": {
        const agentId = str(args, "agentId");
        requireSummary(agentId);
        const entry = host.sendUserMessage(agentId, {
          content: typeof args.prompt === "string" ? args.prompt : "",
          ...(optStr(args, "clientNonce") == null ? {} : { clientNonce: optStr(args, "clientNonce")! }),
          ...(optStr(args, "richText") == null ? {} : { richText: optStr(args, "richText")! }),
          ...(optStr(args, "replyToId") == null ? {} : { replyTo: optStr(args, "replyToId")! }),
          ...(Array.isArray(args.attachmentPaths) ? { attachmentPaths: args.attachmentPaths.filter((p): p is string => typeof p === "string") } : {}),
        });
        return { accepted: true, entryId: entry.id };
      }
      case "reactToMessage":
        host.chat.react(str(args, "agentId"), str(args, "entryId"), str(args, "emoji"));
        return null;
      case "setAgentUnread":
        host.chat.setUnread(str(args, "id"), args.isUnread === true);
        return null;
      case "setAgentHiddenFromSidebar": {
        const id = str(args, "id");
        const hidden = args.isHidden === true;
        if (host.chat.chatKind(id) === "room") host.roster.updateRoom(id, { isHiddenFromSidebar: hidden });
        else host.roster.updateProfile(id, { isHiddenFromSidebar: hidden });
        host.chat.emitUpsert(id);
        return null;
      }
      case "setAgentNotifyOnUpdates": {
        const id = str(args, "id");
        host.roster.updateProfile(id, { notifyOnUpdatesEnabled: args.isEnabled === true });
        host.chat.emitUpsert(id);
        return summaryOrNull(id);
      }
      case "herdrBot.listAdoptable":
        return host.roster.listAdoptable();
      case "herdrBot.focus": {
        const id = str(args, "id");
        await host.roster.focus(host.mirror.get(id).paneId ?? id);
        return null;
      }
      default:
        throw new UnknownMethod(method);
    }
  };

  return async (method, args) => {
    try {
      return ok(await handle(method, args));
    } catch (error) {
      if (error instanceof UnknownMethod) return failed(COORDINATOR_UNKNOWN_METHOD, `no coordinator method "${method}"`);
      if (error instanceof ArgsError) return failed(COORDINATOR_INVALID_ARGS, error.message);
      if (error instanceof RosterError) return failed(error.code, error.message);
      return failed("internal", error instanceof Error ? error.message : String(error));
    }
  };
}

class UnknownMethod extends Error {}
