import { basename } from "node:path";
import type { HostConfig } from "../config.ts";
import { buildIdentityBrief } from "../bots/prompts.ts";
import { isSupportedKind, launchArgsFor } from "../bots/launch-args.ts";
import { GROUP_MAX_MEMBERS, type GroupMember } from "../group/group-chat.ts";
import type { HerdrCli } from "../herdr/cli.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import { HerdrError, type HerdrAgentInfo } from "../herdr/types.ts";
import { log } from "../log.ts";
import { isValidBotId, makeRoomId, suggestBotId } from "../model/ids.ts";
import type { BotProfile, PermissionMode, ProfileStore } from "../store/profile-store.ts";
import type { RoomConfig, RoomStore } from "../store/room-store.ts";
import { WorkspaceRegistry } from "./workspace-registry.ts";

export type RosterErrorCode = "invalid_bot_id" | "bot_exists" | "unknown_bot" | "unknown_room" | "too_many_members" | "unsupported_kind" | "herdr_error" | "bot_not_ready";

/** Outcome of provisioning a reserved (quick-created) bot's herdr agent. `needs_setup` means the pane
 * exists but its shell needs manual first-run setup in herdr before the agent can be prompted. */
export interface ReservedProvision {
  readonly status: "started" | "needs_setup";
  readonly profile: BotProfile;
}

export class RosterError extends Error {
  readonly code: RosterErrorCode;

  constructor(code: RosterErrorCode, message: string) {
    super(message);
    this.name = "RosterError";
    this.code = code;
  }
}

export interface CreateBotArgs {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly kind?: string;
  readonly cwd?: string;
  readonly permissionMode?: PermissionMode;
  readonly avatarShape?: string | null;
  readonly avatarColor?: string | null;
  readonly adoptPaneId?: string;
}

export interface RosterServiceDeps {
  readonly config: HostConfig;
  readonly profiles: ProfileStore;
  readonly rooms: RoomStore;
  readonly cli: HerdrCli;
  readonly mirror: StatusMirror;
  readonly now?: () => number;
  readonly onNotice?: (chatId: string, text: string) => void;
  /** Called once a bot or room is fully removed, so callers can evict any per-chat caches (transcript, view state, run queue). */
  readonly onChatRemoved?: (chatId: string) => void;
  /** Injectable so tests do not wait through real retry backoff. Defaults to a real setTimeout-based sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
}

function toMember(profile: BotProfile): GroupMember {
  return { id: profile.id, name: profile.name, description: profile.description };
}

export class RosterService {
  readonly #deps: RosterServiceDeps;
  readonly #workspaces: WorkspaceRegistry;

  constructor(deps: RosterServiceDeps) {
    this.#deps = deps;
    this.#workspaces = new WorkspaceRegistry(deps.config.home);
  }

  async createBot(args: CreateBotArgs): Promise<BotProfile> {
    const id = args.id ?? suggestBotId(args.name);
    if (!isValidBotId(id)) throw new RosterError("invalid_bot_id", `"${id}" must match ^[a-z][a-z0-9_-]{0,31}$ and not start with "room-"`);
    if (this.#deps.profiles.get(id) != null) throw new RosterError("bot_exists", `bot "${id}" already exists`);
    const profile = args.adoptPaneId == null ? await this.#spawn(id, args) : await this.#adopt(id, args, args.adoptPaneId);
    this.#deps.profiles.save(profile);
    await this.#deps.mirror.refresh();
    await this.#sendBrief(profile);
    return profile;
  }

  async deleteBot(id: string): Promise<void> {
    const profile = this.#requireBot(id);
    const paneId = this.#deps.mirror.get(id).paneId ?? profile.herdr.paneId;
    try {
      if (profile.adopted) await this.#deps.cli.agentRename(id, null);
      else if (paneId != null) await this.#deps.cli.paneClose(paneId);
    } catch (error) {
      log("roster", `herdr cleanup for ${id} failed; removing profile anyway`, error instanceof Error ? error.message : String(error));
    }
    for (const room of this.#deps.rooms.list()) {
      if (room.memberIds.includes(id)) this.#deps.rooms.save({ ...room, memberIds: room.memberIds.filter((member) => member !== id), updatedAt: this.#now() });
    }
    this.#deps.profiles.delete(id);
    await this.#deps.mirror.refresh();
    this.#deps.onChatRemoved?.(id);
  }

  updateProfile(id: string, patch: { readonly name?: string; readonly description?: string; readonly notifyOnUpdatesEnabled?: boolean; readonly isHiddenFromSidebar?: boolean }): BotProfile | null {
    const current = this.#deps.profiles.get(id);
    if (current == null) return null;
    const next: BotProfile = {
      ...current,
      ...(patch.name == null || patch.name.trim().length === 0 ? {} : { name: patch.name.trim() }),
      ...(patch.description == null ? {} : { description: patch.description }),
      ...(patch.notifyOnUpdatesEnabled == null ? {} : { notifyOnUpdatesEnabled: patch.notifyOnUpdatesEnabled }),
      ...(patch.isHiddenFromSidebar == null ? {} : { isHiddenFromSidebar: patch.isHiddenFromSidebar }),
      updatedAt: this.#now(),
    };
    this.#deps.profiles.save(next);
    return next;
  }

  createRoom(args: { readonly name: string; readonly description?: string; readonly memberIds: readonly string[]; readonly requestId?: string }): RoomConfig {
    // Idempotency: a retried group-create submit (e.g. after a client timeout) carries the same
    // requestId, so the coordinator must return the room already created instead of a duplicate --
    // checked before member revalidation, since a retry must succeed even if a member's status changed.
    if (args.requestId != null) {
      const existing = this.#deps.rooms.list().find((room) => room.creationRequestId === args.requestId);
      if (existing != null) return existing;
    }
    const memberIds = this.#validMembers(args.memberIds);
    const now = this.#now();
    const room: RoomConfig = {
      id: makeRoomId(args.name),
      name: args.name.trim().length > 0 ? args.name.trim() : "New room",
      description: args.description ?? "",
      memberIds,
      isHiddenFromSidebar: false,
      createdAt: now,
      updatedAt: now,
      ...(args.requestId == null ? {} : { creationRequestId: args.requestId }),
    };
    this.#deps.rooms.save(room);
    return room;
  }

  setRoomMembers(id: string, memberIds: readonly string[]): RoomConfig | null {
    const room = this.#deps.rooms.get(id);
    if (room == null) return null;
    const next = { ...room, memberIds: this.#validMembers(memberIds), updatedAt: this.#now() };
    this.#deps.rooms.save(next);
    return next;
  }

  updateRoom(id: string, patch: { readonly name?: string; readonly description?: string; readonly isHiddenFromSidebar?: boolean }): RoomConfig | null {
    const room = this.#deps.rooms.get(id);
    if (room == null) return null;
    const next: RoomConfig = {
      ...room,
      ...(patch.name == null || patch.name.trim().length === 0 ? {} : { name: patch.name.trim() }),
      ...(patch.description == null ? {} : { description: patch.description }),
      ...(patch.isHiddenFromSidebar == null ? {} : { isHiddenFromSidebar: patch.isHiddenFromSidebar }),
      updatedAt: this.#now(),
    };
    this.#deps.rooms.save(next);
    return next;
  }

  deleteRoom(id: string): void {
    this.#deps.rooms.delete(id);
    this.#deps.onChatRemoved?.(id);
  }

  async listAdoptable(): Promise<HerdrAgentInfo[]> {
    const known = new Set(this.#deps.profiles.list().map((profile) => profile.id));
    const agents = await this.#deps.cli.agentList();
    return agents.filter((agent) => agent.name == null || !known.has(agent.name));
  }

  resolveBotByPane(paneId: string): BotProfile | null {
    for (const [botId, runtime] of this.#deps.mirror.snapshot()) {
      if (runtime.paneId === paneId) return this.#deps.profiles.get(botId);
    }
    return this.#deps.profiles.list().find((profile) => profile.herdr.paneId === paneId) ?? null;
  }

  memberIdFor(chatId: string): GroupMember | null {
    const profile = this.#deps.profiles.get(chatId);
    return profile == null ? null : toMember(profile);
  }

  async focus(target: string): Promise<void> {
    try {
      await this.#deps.cli.agentFocus(target);
    } catch (error) {
      throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
    }
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }

  #requireBot(id: string): BotProfile {
    const profile = this.#deps.profiles.get(id);
    if (profile == null) throw new RosterError("unknown_bot", `no bot "${id}"`);
    return profile;
  }

  #validMembers(memberIds: readonly string[]): string[] {
    const unique = [...new Set(memberIds)];
    if (unique.length > GROUP_MAX_MEMBERS) throw new RosterError("too_many_members", `a room holds at most ${GROUP_MAX_MEMBERS} bots`);
    for (const id of unique) {
      const bot = this.#requireBot(id);
      // A bot still being onboarded (or whose onboarding failed) has no confirmed identity/agent yet,
      // so it may not be invited into a room until it reaches `ready`.
      if (bot.onboarding != null && bot.onboarding.stage !== "ready") throw new RosterError("bot_not_ready", `"${id}" is still being set up and cannot join a room yet`);
    }
    return unique;
  }

  /**
   * Provisions a reserved (quick-created) bot's herdr agent without the duplicate/id checks `createBot`
   * runs -- the reserved profile is already saved. Reuses an agent already named for this bot id (a lost
   * spawn response, or a host restart) instead of starting a second one. Saves the paneId the moment the
   * pane exists, then the full herdr ref once the agent starts, preserving the profile's onboarding block.
   */
  async provisionReservedBot(id: string): Promise<ReservedProvision> {
    const profile = this.#requireBot(id);
    const existing = await this.#tryAgentGet(id);
    if (existing != null) {
      const merged = this.#mergeHerdrRef(profile, { paneId: existing.pane_id, workspaceId: existing.workspace_id, sessionId: existing.agent_session?.value ?? null }, existing.agent ?? profile.kind);
      return { status: "started", profile: this.#saveProvisioned(id, merged) };
    }
    if (!isSupportedKind(profile.kind)) throw new RosterError("unsupported_kind", `herdr does not support agent kind "${profile.kind}"`);
    // A retry after `needs_setup` keeps the pane it already made (the user may have finished first-run
    // setup in it); start into that same pane instead of orphaning it with a fresh #locationFor pane.
    const withPane = profile.herdr.paneId != null
      ? profile
      : this.#saveProvisioned(id, { ...profile, herdr: { ...(await this.#locationFor(profile.cwd, id)), sessionId: null }, updatedAt: this.#now() });
    const result = await this.#startReservedAgent(withPane);
    const merged = this.#mergeHerdrRef(withPane, result.herdr, result.kind);
    return { status: result.status, profile: this.#saveProvisioned(id, merged) };
  }

  /** Sends the identity brief and reports whether herdr confirmed it -- unlike the fire-and-forget
   * `#sendBrief`, so the onboarding sequence can hold back the greeting when the brief did not land. */
  async briefReservedBot(profile: BotProfile): Promise<boolean> {
    return (await this.#promptBrief(profile)).ok;
  }

  /** Persists a provisioning step's profile, but never resurrects a profile deleted mid-provision. */
  #saveProvisioned(id: string, profile: BotProfile): BotProfile {
    if (this.#deps.profiles.get(id) == null) throw new RosterError("unknown_bot", `bot "${id}" was removed during provisioning`);
    this.#deps.profiles.save(profile);
    return profile;
  }

  #mergeHerdrRef(profile: BotProfile, herdr: BotProfile["herdr"], kind: string): BotProfile {
    return { ...profile, herdr, kind, updatedAt: this.#now() };
  }

  async #tryAgentGet(id: string): Promise<HerdrAgentInfo | null> {
    try {
      const info = await this.#deps.cli.agentGet(id);
      return info.name === id ? info : null;
    } catch {
      return null;
    }
  }

  /**
   * Starts the reserved bot's agent on its already-saved pane. `agent_not_ready` becomes `needs_setup`
   * (the pane is kept so the user can finish first-run setup in herdr). Any other failure first checks
   * whether the agent actually came up (a lost response / `agent_name_taken` on retry) and reuses it;
   * only if nothing is there does it close the pane and surface a herdr error.
   */
  async #startReservedAgent(profile: BotProfile): Promise<{ status: "started" | "needs_setup"; herdr: BotProfile["herdr"]; kind: string }> {
    const paneId = profile.herdr.paneId!;
    const workspaceId = profile.herdr.workspaceId;
    const launchArgs = launchArgsFor(profile.kind, profile.permissionMode, this.#deps.config.cliPath);
    try {
      const started = await this.#startAgentWithRetry({ name: profile.id, kind: profile.kind, paneId, agentArgs: launchArgs });
      return { status: "started", herdr: { paneId, workspaceId, sessionId: started.agent_session?.value ?? null }, kind: profile.kind };
    } catch (error) {
      if (error instanceof HerdrError && error.code === "agent_not_ready") {
        return { status: "needs_setup", herdr: { paneId, workspaceId, sessionId: null }, kind: profile.kind };
      }
      const recovered = await this.#tryAgentGet(profile.id);
      if (recovered != null) return { status: "started", herdr: { paneId: recovered.pane_id, workspaceId: recovered.workspace_id, sessionId: recovered.agent_session?.value ?? null }, kind: recovered.agent ?? profile.kind };
      try {
        await this.#deps.cli.paneClose(paneId);
      } catch (closeError) {
        log("roster", `failed to close pane ${paneId} after a failed reserved agent start for ${profile.id}`, closeError instanceof Error ? closeError.message : String(closeError));
      }
      throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
    }
  }

  async #spawn(id: string, args: CreateBotArgs): Promise<BotProfile> {
    const kind = args.kind ?? this.#deps.config.defaultKind;
    if (!isSupportedKind(kind)) throw new RosterError("unsupported_kind", `herdr does not support agent kind "${kind}"`);
    const cwd = args.cwd ?? this.#deps.config.defaultCwd;
    const permissionMode = args.permissionMode ?? "ask";
    const location = await this.#locationFor(cwd, id);
    const launchArgs = launchArgsFor(kind, permissionMode, this.#deps.config.cliPath);
    const sessionId = await this.#startAgent(id, kind, location.paneId, launchArgs);
    const now = this.#now();
    return {
      id, name: args.name.trim().length > 0 ? args.name.trim() : id, description: args.description ?? "", kind, cwd, permissionMode,
      avatarShape: args.avatarShape ?? null, avatarColor: args.avatarColor ?? null, adopted: false,
      herdr: { paneId: location.paneId, workspaceId: location.workspaceId, sessionId },
      notifyOnUpdatesEnabled: true, isHiddenFromSidebar: false, createdAt: now, updatedAt: now,
    };
  }

  /**
   * Starts the agent, closing the freshly created pane and rethrowing a RosterError only once
   * the retries in #startAgentWithRetry are exhausted. `agent_not_ready` (the pane needs manual
   * first-run setup) is never retried since retrying it cannot help; it becomes a notice instead.
   */
  async #startAgent(id: string, kind: string, paneId: string, agentArgs: readonly string[]): Promise<string | null> {
    try {
      const started = await this.#startAgentWithRetry({ name: id, kind, paneId, agentArgs });
      return started.agent_session?.value ?? null;
    } catch (error) {
      if (error instanceof HerdrError && error.code === "agent_not_ready") {
        this.#deps.onNotice?.(id, `${id} needs first-run setup in herdr (pane ${paneId}); finish it there and the bot will come online.`);
        return null;
      }
      try {
        await this.#deps.cli.paneClose(paneId);
      } catch (closeError) {
        log("roster", `failed to close pane ${paneId} after a failed agent start for ${id}`, closeError instanceof Error ? closeError.message : String(closeError));
      }
      throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Retries `agentStart` up to 3 attempts with a 500ms backoff: a just-created pane's shell is
   * sometimes not interactive yet, and herdr answers with a (non "agent_not_ready") HerdrError
   * that a short retry reliably clears. `agent_not_ready` is never retried here (see #startAgent).
   */
  async #startAgentWithRetry(args: { name: string; kind: string; paneId: string; agentArgs: readonly string[] }): Promise<HerdrAgentInfo> {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.#deps.cli.agentStart(args);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof HerdrError && error.code !== "agent_not_ready";
        if (!retryable) throw error;
        if (attempt < maxAttempts) {
          log("roster", `agent start for ${args.name} failed on attempt ${attempt}/${maxAttempts}; retrying`, error instanceof Error ? error.message : String(error));
          await this.#sleep(500);
        }
      }
    }
    throw lastError;
  }

  #sleep(ms: number): Promise<void> {
    return (this.#deps.sleep ?? ((delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay))))(ms);
  }

  async #adopt(id: string, args: CreateBotArgs, paneId: string): Promise<BotProfile> {
    let info: HerdrAgentInfo;
    try {
      info = await this.#deps.cli.agentGet(paneId);
      if (info.name !== id) await this.#deps.cli.agentRename(paneId, id);
    } catch (error) {
      throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
    }
    const now = this.#now();
    return {
      id, name: args.name.trim().length > 0 ? args.name.trim() : id, description: args.description ?? "", kind: info.agent ?? "unknown", cwd: info.cwd ?? this.#deps.config.defaultCwd,
      permissionMode: args.permissionMode ?? "ask", avatarShape: args.avatarShape ?? null, avatarColor: args.avatarColor ?? null, adopted: true,
      herdr: { paneId: info.pane_id, workspaceId: info.workspace_id, sessionId: info.agent_session?.value ?? null },
      notifyOnUpdatesEnabled: true, isHiddenFromSidebar: false, createdAt: now, updatedAt: now,
    };
  }

  async #locationFor(cwd: string, botId: string): Promise<{ workspaceId: string; paneId: string }> {
    try {
      const known = this.#workspaces.get(cwd);
      const live = known == null ? false : (await this.#deps.cli.workspaceList()).some((workspace) => workspace.workspace_id === known);
      if (known != null && live) {
        const tab = await this.#deps.cli.tabCreate({ workspaceId: known, cwd, label: botId });
        return { workspaceId: known, paneId: tab.rootPaneId };
      }
      const created = await this.#deps.cli.workspaceCreate({ cwd, label: `herdr-bot: ${basename(cwd)}` });
      this.#workspaces.set(cwd, created.workspaceId);
      return { workspaceId: created.workspaceId, paneId: created.rootPaneId };
    } catch (error) {
      throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
    }
  }

  async #sendBrief(profile: BotProfile): Promise<void> {
    const result = await this.#promptBrief(profile);
    if (!result.ok) this.#deps.onNotice?.(profile.id, `${profile.id} did not confirm its room briefing yet (${result.detail}). It will still receive turn prompts.`);
  }

  async #promptBrief(profile: BotProfile): Promise<{ ok: boolean; detail?: string }> {
    const brief = buildIdentityBrief({ bot: toMember(profile), userName: this.#deps.config.userName, cliPath: this.#deps.config.cliPath });
    try {
      await this.#deps.cli.agentPrompt({ target: profile.id, text: brief, wait: true, timeoutMs: this.#deps.config.briefTimeoutMs });
      return { ok: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log("roster", `identity brief for ${profile.id} was not confirmed`, detail);
      return { ok: false, detail };
    }
  }
}
