/** herdr-bot (Task 7, plan bot-collaboration-and-launch-settings): pure model for the New Bot/Room
 * dialog -- id derivation, provider/model capability gating, and the createAgent request builder.
 * Kept dependency-free (no React/DOM) so it is testable without a browser harness, mirroring how
 * new-chat-model.ts separates option-composition/keyboard-math from NewChatHeader.tsx's JSX; see
 * NewChatDialog.tsx for this file's presentational half. */

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

/** Mirrors core/src/bots/launch-args.ts's providerLaunchCapabilities -- redeclared here rather than
 * imported across the core/renderer package boundary, matching this codebase's existing convention
 * for cross-boundary types (see PermissionMode in NewChatDialog.tsx). */
const MODEL_CAPABLE_KINDS = new Set(["claude", "codex", "grok", "gemini", "opencode"]);
const REASONING_CAPABLE_KINDS = new Set(["claude", "codex", "grok"]);

export function supportsModelSelection(kind: string): boolean {
  return MODEL_CAPABLE_KINDS.has(kind);
}

export function supportsReasoningEffort(kind: string): boolean {
  return REASONING_CAPABLE_KINDS.has(kind);
}

/** Mirrors core/src/bots/model-catalog.ts's ModelEntry/ModelCatalogResult -- redeclared locally per
 * the same cross-boundary convention. */
export interface ModelEntry {
  readonly id: string;
  readonly label: string;
}

export type ModelCatalogSource = "installed-cli" | "latest-alias" | "user-fallback" | "unavailable";

export interface ModelCatalogResult {
  readonly models: readonly ModelEntry[];
  readonly source: ModelCatalogSource;
  readonly error?: string;
}

export interface CreateBotRequest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly cwd: string;
  readonly permissionMode: "ask" | "auto";
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly adoptPaneId?: string;
}

export interface CreateRoomRequest {
  readonly name: string;
  readonly description: string;
  readonly memberIds: string[];
}

export interface AdoptableAgent {
  readonly pane_id: string;
  readonly agent: string | null;
  readonly cwd: string | null;
  readonly name: string | null;
}

export interface BotDefaults {
  readonly cwd: string;
  readonly kind: string;
}

export interface DirectoryListing {
  readonly exists: boolean;
  readonly entries: readonly string[];
}

/** Sentinel `source` value meaning "spawn a new agent" rather than adopt an existing pane -- shared
 * between the dialog's Source select and buildCreateBotRequest's adopt-vs-spawn branch below. */
export const SPAWN_SOURCE = "__spawn__";

export function suggestBotId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "");
  if (slug.length === 0) return "bot";
  return /^[a-z]/.test(slug) ? slug : `bot-${slug}`.slice(0, 32);
}

export function isValidBotId(id: string): boolean {
  return /^[a-z][a-z0-9_-]{0,31}$/.test(id) && !id.startsWith("room-");
}

/** The dialog never asks for an id; it derives one from the name and, on collision, appends -2, -3, ... */
export function uniqueBotId(name: string, takenIds: ReadonlySet<string>): string {
  const base = suggestBotId(name);
  if (!takenIds.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 32 - String(suffix).length - 1)}-${suffix}`;
    if (!takenIds.has(candidate)) return candidate;
  }
  return base;
}

export interface BuildCreateBotRequestInput {
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly cwd: string;
  readonly permissionMode: "ask" | "auto";
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly source: string;
  readonly takenIds: ReadonlySet<string>;
}

/**
 * Builds the createAgent request from the dialog's raw form state. Extracted so this logic -- id
 * derivation, trimming, and clearing model/reasoningEffort (and attaching adoptPaneId instead) when
 * the source is an adopted pane rather than a spawned agent -- is unit-testable without DOM event
 * simulation (Task 7 plan step 1).
 */
export function buildCreateBotRequest(input: BuildCreateBotRequestInput): CreateBotRequest {
  const name = input.name.trim();
  const id = uniqueBotId(name, input.takenIds);
  const isAdopt = input.source !== SPAWN_SOURCE;
  const trimmedModel = input.model == null ? null : input.model.trim();
  return {
    id,
    name,
    description: input.description,
    kind: input.kind,
    cwd: input.cwd.trim(),
    permissionMode: input.permissionMode,
    model: isAdopt ? null : trimmedModel != null && trimmedModel.length > 0 ? trimmedModel : null,
    reasoningEffort: isAdopt ? null : input.reasoningEffort,
    ...(isAdopt ? { adoptPaneId: input.source } : {}),
  };
}
