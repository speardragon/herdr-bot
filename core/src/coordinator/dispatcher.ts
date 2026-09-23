import type { Host } from "../host.ts";
import type { ReasoningEffort } from "../bots/launch-args.ts";
import { isValidRequestId } from "../bots/onboarding.ts";
import { RosterError } from "../services/roster-service.ts";
import type { PermissionMode } from "../store/profile-store.ts";
import type { AgentSummary } from "../model/summaries.ts";
import { COORDINATOR_INVALID_ARGS, COORDINATOR_UNKNOWN_METHOD, COORDINATOR_UNSUPPORTED, type CoordinatorReplyOutcome } from "./frames.ts";
import { listDirectories } from "../services/directory-browser.ts";
import { listBotModels } from "../bots/model-catalog.ts";

type Args = Record<string, unknown>;
type Handler = (host: Host, args: Args) => Promise<unknown> | unknown;

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ArgsError extends Error {}
class UnknownMethod extends Error {}
class Unsupported extends Error {}

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

function requireSummary(host: Host, id: string): AgentSummary {
  const summary = host.chat.summary(id);
  if (summary == null) throw new ArgsError(`no chat "${id}"`);
  return summary;
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

function searchAgents(host: Host, args: Args): AgentSummary[] {
  const query = (optStr(args, "query") ?? "").toLowerCase();
  return host.chat.listSummaries().filter((s) => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query));
}

async function createAgent(host: Host, args: Args): Promise<unknown> {
  const bot = isRecord(args.herdrBot) ? args.herdrBot : {};
  const mode = bot.permissionMode === "ask" || bot.permissionMode === "auto" ? (bot.permissionMode as PermissionMode) : undefined;
  const profile = await host.roster.createBot({
    name: str(args, "name"),
    ...(optStr(bot, "id") == null ? {} : { id: optStr(bot, "id")! }),
    ...(optStr(args, "description") == null ? {} : { description: optStr(args, "description")! }),
    ...(optStr(bot, "kind") == null ? {} : { kind: optStr(bot, "kind")! }),
    ...(optStr(bot, "cwd") == null ? {} : { cwd: optStr(bot, "cwd")! }),
    ...(bot.model == null ? {} : { model: str(bot, "model") }),
    ...(bot.reasoningEffort == null ? {} : { reasoningEffort: str(bot, "reasoningEffort") as ReasoningEffort }),
    ...(mode == null ? {} : { permissionMode: mode }),
    ...(optStr(bot, "adoptPaneId") == null ? {} : { adoptPaneId: optStr(bot, "adoptPaneId")! }),
    avatarShape: optStr(args, "avatarShape") ?? null,
    avatarColor: optStr(args, "avatarColor") ?? null,
  });
  host.chat.emitRoster();
  return { agent: requireSummary(host, profile.id), transcript: [] };
}

/** Saves a reserved profile and responds immediately; spawn/brief/greeting run asynchronously. */
function quickCreateBot(host: Host, args: Args): unknown {
  const requestId = str(args, "requestId");
  if (!isValidRequestId(requestId)) throw new ArgsError("requestId must be a UUID");
  if (args.locale !== "ko" && args.locale !== "en") throw new ArgsError('locale must be "ko" or "en"');
  // A blank/whitespace-only name (the combobox never sends one, but a stale/hand-rolled call might)
  // is treated the same as omitting it -- onboarding.create falls back to the plain default name.
  const name = optStr(args, "name");
  const profile = host.onboarding.create({ requestId, locale: args.locale, ...(name == null || name.trim().length === 0 ? {} : { name }) });
  host.chat.emitRoster();
  return { agent: requireSummary(host, profile.id) };
}

/** Re-runs setup against the existing reserved profile (never creates a new one). */
function retryBotSetup(host: Host, args: Args): unknown {
  const profile = host.onboarding.retry(str(args, "id"));
  host.chat.emitRoster();
  return { agent: requireSummary(host, profile.id) };
}

function createGroup(host: Host, args: Args): unknown {
  const requestId = optStr(args, "requestId");
  if (requestId != null && !isValidRequestId(requestId)) throw new ArgsError("requestId must be a UUID");
  const room = host.roster.createRoom({
    name: str(args, "name"),
    ...(optStr(args, "description") == null ? {} : { description: optStr(args, "description")! }),
    memberIds: strArray(args, "memberIds"),
    ...(requestId == null ? {} : { requestId }),
  });
  host.chat.emitRoster();
  return { agent: requireSummary(host, room.id), transcript: [] };
}

function setGroupMembers(host: Host, args: Args): unknown {
  const room = host.roster.setRoomMembers(str(args, "id"), strArray(args, "memberAgentIds"));
  if (room != null) host.chat.emitUpsert(room.id);
  return room == null ? null : host.chat.summary(room.id);
}

function updateAgent(host: Host, args: Args): unknown {
  const id = str(args, "id");
  const profile = isRecord(args.profile) ? args.profile : {};
  const patch = { ...(optStr(profile, "name") == null ? {} : { name: optStr(profile, "name")! }), ...(typeof profile.description === "string" ? { description: profile.description } : {}) };
  // The optional label (`title`) is a bot-only field; rooms have no label in the reference UI.
  const botPatch = { ...patch, ...(typeof profile.title === "string" ? { title: profile.title } : {}) };
  const updated = host.chat.chatKind(id) === "room" ? host.roster.updateRoom(id, patch) : host.roster.updateProfile(id, botPatch);
  if (updated != null) host.chat.emitUpsert(id);
  return updated == null ? null : host.chat.summary(id);
}

async function deleteAgents(host: Host, args: Args): Promise<unknown> {
  const ids = strArray(args, "ids");
  for (const id of ids) {
    if (host.chat.chatKind(id) === "room") host.roster.deleteRoom(id);
    else if (host.chat.chatKind(id) === "bot") await host.roster.deleteBot(id);
  }
  host.chat.emitRoster();
  return { deletedIds: ids };
}

function duplicateAgent(): never {
  throw new Unsupported("duplicating bots is not supported");
}

// herdr-bot: openAgentTail is read-only. Loading (or preloading/searching) a transcript page must
// never itself acknowledge messages as read -- the renderer ACKs explicitly via markChatRead once it
// has actually rendered a page (Task 2: read ACKs are decoupled from transcript loading).
function openAgentTail(host: Host, args: Args): unknown {
  const id = str(args, "id");
  requireSummary(host, id);
  return host.chat.tail(id, num(args, "limit", 200));
}

function getAgentTranscriptTail(host: Host, args: Args): unknown {
  const id = str(args, "id");
  requireSummary(host, id);
  return host.chat.tail(id, num(args, "limit", 200), typeof args.beforeSeq === "number" ? args.beforeSeq : undefined);
}

function getAgentTranscriptWindow(host: Host, args: Args): unknown {
  const id = str(args, "id");
  requireSummary(host, id);
  return { ...host.chat.tail(id, num(args, "limit", 200), typeof args.beforeSeq === "number" ? args.beforeSeq : undefined), threadCounts: {} };
}

function getAgentThread(host: Host, args: Args): unknown {
  return { entries: host.chat.thread(str(args, "id"), str(args, "rootId")) };
}

function sendPrompt(host: Host, args: Args): unknown {
  const agentId = str(args, "agentId");
  requireSummary(host, agentId);
  const entry = host.sendUserMessage(agentId, {
    content: typeof args.prompt === "string" ? args.prompt : "",
    ...(optStr(args, "clientNonce") == null ? {} : { clientNonce: optStr(args, "clientNonce")! }),
    ...(optStr(args, "richText") == null ? {} : { richText: optStr(args, "richText")! }),
    ...(optStr(args, "replyToId") == null ? {} : { replyTo: optStr(args, "replyToId")! }),
    ...(Array.isArray(args.attachmentPaths) ? { attachmentPaths: args.attachmentPaths.filter((p): p is string => typeof p === "string") } : {}),
  });
  return { accepted: true, entryId: entry.id };
}

function reactToMessage(host: Host, args: Args): null {
  host.chat.react(str(args, "agentId"), str(args, "entryId"), str(args, "emoji"));
  return null;
}

function setAgentUnread(host: Host, args: Args): null {
  host.chat.setUnread(str(args, "id"), args.isUnread === true);
  return null;
}

function markChatRead(host: Host, args: Args): unknown {
  const id = str(args, "id");
  requireSummary(host, id);
  const throughSeq = args.throughSeq;
  if (typeof throughSeq !== "number" || !Number.isInteger(throughSeq) || throughSeq < 0) {
    throw new ArgsError("throughSeq must be a non-negative integer");
  }
  return host.chat.markRead(id, throughSeq);
}

function setAgentHiddenFromSidebar(host: Host, args: Args): null {
  const id = str(args, "id");
  const hidden = args.isHidden === true;
  if (host.chat.chatKind(id) === "room") host.roster.updateRoom(id, { isHiddenFromSidebar: hidden });
  else host.roster.updateProfile(id, { isHiddenFromSidebar: hidden });
  host.chat.emitUpsert(id);
  return null;
}

function setAgentNotifyOnUpdates(host: Host, args: Args): unknown {
  const id = str(args, "id");
  host.roster.updateProfile(id, { notifyOnUpdatesEnabled: args.isEnabled === true });
  host.chat.emitUpsert(id);
  return host.chat.summary(id);
}

async function herdrBotFocus(host: Host, args: Args): Promise<null> {
  const id = str(args, "id");
  await host.roster.focus(host.mirror.get(id).paneId ?? id);
  return null;
}

function herdrBotDefaults(host: Host): unknown {
  return { cwd: host.config.defaultCwd, kind: host.config.defaultKind };
}

const METHOD_TABLE: Readonly<Record<string, Handler>> = {
  listAgents: (host) => host.chat.listSummaries(),
  countAgents: (host) => host.chat.listSummaries().length,
  searchAgents,
  createAgent,
  createGroup,
  setGroupMembers,
  updateAgent,
  deleteAgents,
  duplicateAgent,
  openAgentTail,
  getAgentTranscriptTail,
  getAgentTranscriptWindow,
  getAgentThread,
  sendPrompt,
  reactToMessage,
  setAgentUnread,
  setAgentHiddenFromSidebar,
  setAgentNotifyOnUpdates,
  "herdrBot.quickCreateBot": quickCreateBot,
  "herdrBot.retryBotSetup": retryBotSetup,
  "herdrBot.markChatRead": markChatRead,
  "herdrBot.listAdoptable": (host) => host.roster.listAdoptable(),
  "herdrBot.focus": herdrBotFocus,
  "herdrBot.defaults": herdrBotDefaults,
  "herdrBot.listDirectories": (_host, args) => listDirectories(optStr(args, "path") ?? ""),
  "herdrBot.listModels": (_host, args) => listBotModels(str(args, "kind")),
};

function ok(value: unknown): CoordinatorReplyOutcome {
  return { status: "ok", value };
}

function failed(code: string, message: string): CoordinatorReplyOutcome {
  return { status: "failed", failure: { code, message } };
}

async function resolve(host: Host, method: string, raw: unknown): Promise<unknown> {
  const args: Args = isRecord(raw) ? raw : {};
  if (EMPTY_ARRAY_METHODS.has(method)) return [];
  if (NULL_METHODS.has(method)) return null;
  if (FALSE_METHODS.has(method)) return false;
  if (method in OBJECT_STUBS) return OBJECT_STUBS[method];
  const handler = METHOD_TABLE[method];
  if (handler == null) throw new UnknownMethod(method);
  return handler(host, args);
}

function mapError(method: string, error: unknown): CoordinatorReplyOutcome {
  if (error instanceof UnknownMethod) return failed(COORDINATOR_UNKNOWN_METHOD, `no coordinator method "${method}"`);
  if (error instanceof Unsupported) return failed(COORDINATOR_UNSUPPORTED, error.message);
  if (error instanceof ArgsError) return failed(COORDINATOR_INVALID_ARGS, error.message);
  if (error instanceof RosterError) return failed(error.code, error.message);
  return failed("internal", error instanceof Error ? error.message : String(error));
}

export function createCoordinatorDispatcher(host: Host): (method: string, args: unknown) => Promise<CoordinatorReplyOutcome> {
  return async (method, args) => {
    try {
      return ok(await resolve(host, method, args));
    } catch (error) {
      return mapError(method, error);
    }
  };
}
