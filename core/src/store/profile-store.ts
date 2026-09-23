import { readdirSync, rmSync } from "node:fs";
import { hostPaths } from "../config.ts";
import type { BotOnboarding, OnboardingStage } from "../bots/onboarding.ts";
import { REASONING_EFFORTS, type ReasoningEffort } from "../bots/launch-args.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";

export type PermissionMode = "ask" | "auto";

export interface BotHerdrRef {
  readonly paneId: string | null;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
}

export interface BotProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** herdr-bot: the optional free-text label under the name in Agent Settings ("리서치, 마케팅, 관리");
   * surfaced to the renderer as the summary's `title`. Absent (not "") on profiles that never set one. */
  readonly title?: string;
  readonly kind: string;
  readonly cwd: string;
  readonly permissionMode: PermissionMode;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly avatarShape: string | null;
  readonly avatarColor: string | null;
  readonly adopted: boolean;
  readonly herdr: BotHerdrRef;
  readonly notifyOnUpdatesEnabled: boolean;
  readonly isHiddenFromSidebar: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Present only on a "quick create" bot mid- or post-onboarding; existing bots never carry it. */
  readonly onboarding?: BotOnboarding;
}

const ONBOARDING_STAGES: ReadonlySet<string> = new Set(["provisioning", "briefing", "greeting", "ready", "failed"]);

function projectOnboarding(value: unknown): BotOnboarding | null {
  if (!isRecord(value)) return null;
  if (typeof value.requestId !== "string" || value.requestId.length === 0) return null;
  if (value.locale !== "ko" && value.locale !== "en") return null;
  if (typeof value.stage !== "string" || !ONBOARDING_STAGES.has(value.stage)) return null;
  return { requestId: value.requestId, locale: value.locale, stage: value.stage as OnboardingStage, error: typeof value.error === "string" ? value.error : null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function modelOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function reasoningEffortOrNull(value: unknown): ReasoningEffort | null {
  return typeof value === "string" && REASONING_EFFORTS.some((effort) => effort === value) ? value as ReasoningEffort : null;
}

function projectHerdrRef(value: unknown): BotHerdrRef {
  const record = isRecord(value) ? value : {};
  return { paneId: stringOrNull(record.paneId), workspaceId: stringOrNull(record.workspaceId), sessionId: stringOrNull(record.sessionId) };
}

export function projectBotProfile(value: unknown): BotProfile | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.kind !== "string" || typeof value.cwd !== "string") return null;
  if (value.permissionMode !== "ask" && value.permissionMode !== "auto") return null;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    kind: value.kind,
    cwd: value.cwd,
    permissionMode: value.permissionMode,
    model: modelOrNull(value.model),
    reasoningEffort: reasoningEffortOrNull(value.reasoningEffort),
    avatarShape: stringOrNull(value.avatarShape),
    avatarColor: stringOrNull(value.avatarColor),
    adopted: value.adopted === true,
    herdr: projectHerdrRef(value.herdr),
    notifyOnUpdatesEnabled: value.notifyOnUpdatesEnabled !== false,
    isHiddenFromSidebar: value.isHiddenFromSidebar === true,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(projectOnboarding(value.onboarding) == null ? {} : { onboarding: projectOnboarding(value.onboarding)! }),
  };
}

function listDirectories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export class ProfileStore {
  readonly home: string;

  constructor(home: string) {
    this.home = home;
  }

  list(): BotProfile[] {
    return listDirectories(hostPaths.bots(this.home)).flatMap((id) => {
      const profile = this.get(id);
      return profile == null ? [] : [profile];
    });
  }

  get(id: string): BotProfile | null {
    return readJsonFile(hostPaths.botProfile(this.home, id), projectBotProfile);
  }

  save(profile: BotProfile): void {
    writeJsonFileAtomic(hostPaths.botProfile(this.home, profile.id), profile);
  }

  delete(id: string): void {
    rmSync(hostPaths.bot(this.home, id), { recursive: true, force: true });
  }
}
