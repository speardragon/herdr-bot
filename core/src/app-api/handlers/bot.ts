/** Handlers for bot.*, room.*, and prompt.* -- creating/adopting/configuring bots, rooms, and answering
 * a blocked bot's pending prompt card. */
import { homedir } from "node:os";
import type { Host } from "../../host.ts";
import { isSupportedKind } from "../../bots/launch-args.ts";
import { listBotModels } from "../../bots/model-catalog.ts";
import { isValidRequestId } from "../../bots/onboarding.ts";
import type { PermissionMode } from "../../store/profile-store.ts";
import { AppApiError } from "../errors.ts";
import { toAdoptableAgent, toChatSummary } from "../mapping.ts";
import type { AdoptableAgent, BotDefaults, ChatSummary, ModelCatalogResult, ReasoningEffort } from "../types.ts";
import { bool, optStr, record, str, strArray } from "../validate.ts";

function requireChatSummary(host: Host, chatId: string): ChatSummary {
  const summary = host.chat.summary(chatId);
  if (summary == null) throw new AppApiError("unknown_chat", `no chat "${chatId}"`);
  return toChatSummary(summary);
}

function permissionModeOf(raw: Record<string, unknown>): PermissionMode | undefined {
  return raw.permissionMode === "ask" || raw.permissionMode === "auto" ? (raw.permissionMode as PermissionMode) : undefined;
}

/** Like `permissionModeOf`, but for `bot.updateLaunchSettings`, which (like `model`/`reasoningEffort`)
 * distinguishes an absent `permissionMode` key (keep the bot's current mode) from an explicit `null`
 * (reset to the host's effective default permission mode) -- so this returns `{}` when the key is
 * absent, rather than collapsing "absent" and "invalid" into the same `undefined`. */
function permissionModePatch(raw: Record<string, unknown>): { permissionMode?: PermissionMode | null } {
  if (!("permissionMode" in raw)) return {};
  if (raw.permissionMode === null) return { permissionMode: null };
  const mode = permissionModeOf(raw);
  return mode == null ? {} : { permissionMode: mode };
}

export async function createBot(host: Host, raw: unknown): Promise<{ readonly chat: ChatSummary }> {
  const params = record(raw);
  const profile = await host.roster.createBot({
    name: str(params, "name"),
    ...(optStr(params, "id") == null ? {} : { id: optStr(params, "id")! }),
    ...(optStr(params, "description") == null ? {} : { description: optStr(params, "description")! }),
    ...(optStr(params, "provider") == null ? {} : { kind: optStr(params, "provider")! }),
    ...(optStr(params, "cwd") == null ? {} : { cwd: optStr(params, "cwd")! }),
    ...(permissionModeOf(params) == null ? {} : { permissionMode: permissionModeOf(params) }),
    ...(params.model == null ? {} : { model: str(params, "model") }),
    ...(params.reasoningEffort == null ? {} : { reasoningEffort: str(params, "reasoningEffort") as ReasoningEffort }),
    ...(optStr(params, "adoptPaneId") == null ? {} : { adoptPaneId: optStr(params, "adoptPaneId")! }),
    avatarShape: ("avatarShape" in params ? (params.avatarShape as string | null) : null) ?? null,
    avatarColor: ("avatarColor" in params ? (params.avatarColor as string | null) : null) ?? null,
    allowHomeCwd: bool(params, "allowHomeCwd"),
  });
  host.chat.emitRoster();
  return { chat: requireChatSummary(host, profile.id) };
}

export function quickCreateBot(host: Host, raw: unknown): { readonly chat: ChatSummary } {
  const params = record(raw);
  const requestId = str(params, "requestId");
  if (!isValidRequestId(requestId)) throw new AppApiError("invalid_args", "requestId must be a UUID");
  if (params.locale !== "ko" && params.locale !== "en") throw new AppApiError("invalid_args", 'locale must be "ko" or "en"');
  const name = optStr(params, "name");
  const avatarColor = optStr(params, "avatarColor");
  const profile = host.onboarding.create({
    requestId,
    locale: params.locale,
    ...(name == null ? {} : { name }),
    ...(avatarColor == null ? {} : { avatarColor }),
  });
  host.chat.emitRoster();
  return { chat: requireChatSummary(host, profile.id) };
}

export function retrySetup(host: Host, raw: unknown): { readonly chat: ChatSummary } {
  const params = record(raw);
  const profile = host.onboarding.retry(str(params, "botId"));
  host.chat.emitRoster();
  return { chat: requireChatSummary(host, profile.id) };
}

export async function updateLaunchSettings(host: Host, raw: unknown): Promise<{ readonly chat: ChatSummary }> {
  const params = record(raw);
  const botId = str(params, "botId");
  // Relaunching closes the bot's current pane -- route through the bot lock so this can never race an
  // in-flight turn's agentPrompt call on the same pane (see RosterService.relaunchBot's doc).
  const profile = await host.turns.withBotLock(botId, () => host.roster.relaunchBot(botId, {
    ...(optStr(params, "cwd") == null ? {} : { cwd: optStr(params, "cwd")! }),
    ...permissionModePatch(params),
    ...("model" in params ? { model: typeof params.model === "string" && params.model.length > 0 ? params.model : null } : {}),
    ...("reasoningEffort" in params ? { reasoningEffort: typeof params.reasoningEffort === "string" ? (params.reasoningEffort as ReasoningEffort) : null } : {}),
    allowHomeCwd: bool(params, "allowHomeCwd"),
  }));
  host.chat.emitUpsert(profile.id);
  return { chat: requireChatSummary(host, profile.id) };
}

export async function focusBot(host: Host, raw: unknown): Promise<void> {
  const params = record(raw);
  const botId = str(params, "botId");
  await host.roster.focus(host.mirror.get(botId).paneId ?? botId);
}

export async function listAdoptable(host: Host): Promise<readonly AdoptableAgent[]> {
  const agents = await host.roster.listAdoptable();
  return agents.map(toAdoptableAgent);
}

export async function listModels(host: Host, raw: unknown): Promise<ModelCatalogResult> {
  const params = record(raw);
  return listBotModels(str(params, "provider"));
}

export function botDefaults(host: Host): BotDefaults {
  return { cwd: host.roster.effectiveDefaultCwd() ?? "", provider: host.roster.effectiveDefaultKind(), permissionMode: host.roster.effectiveDefaultPermissionMode(), homeDir: homedir() };
}

export function createRoom(host: Host, raw: unknown): { readonly chat: ChatSummary } {
  const params = record(raw);
  const requestId = optStr(params, "requestId");
  if (requestId != null && !isValidRequestId(requestId)) throw new AppApiError("invalid_args", "requestId must be a UUID");
  const room = host.roster.createRoom({
    name: str(params, "name"),
    ...(optStr(params, "description") == null ? {} : { description: optStr(params, "description")! }),
    memberIds: strArray(params, "memberIds"),
    ...(requestId == null ? {} : { requestId }),
  });
  host.chat.emitRoster();
  return { chat: requireChatSummary(host, room.id) };
}

export function setRoomMembers(host: Host, raw: unknown): ChatSummary | null {
  const params = record(raw);
  const room = host.roster.setRoomMembers(str(params, "roomId"), strArray(params, "memberIds"));
  if (room == null) return null;
  host.chat.emitUpsert(room.id);
  const summary = host.chat.summary(room.id);
  return summary == null ? null : toChatSummary(summary);
}

export async function answerPrompt(host: Host, raw: unknown): Promise<{ readonly chat: ChatSummary }> {
  const params = record(raw);
  const botId = str(params, "botId");
  requireChatSummary(host, botId);
  const answer = (() => {
    switch (params.action) {
      case "option": return { action: "option" as const, key: str(params, "key") };
      case "text": return { action: "text" as const, text: str(params, "text") };
      case "next": return { action: "next" as const };
      case "cancel": return { action: "cancel" as const };
      default: throw new AppApiError("invalid_args", 'action must be "option", "text", "next", or "cancel"');
    }
  })();
  await host.prompts.answer(botId, str(params, "signature"), answer);
  await host.mirror.refresh();
  return { chat: requireChatSummary(host, botId) };
}

export function supportedProvider(provider: string): boolean {
  return isSupportedKind(provider);
}
