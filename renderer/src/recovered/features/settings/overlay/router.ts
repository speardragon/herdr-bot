import type { AgentDesktopBridge } from "../../../contracts/desktop-bridge";

export type RouterProviderId = "cursor" | "claude-code" | "codex" | "openrouter";

export interface RouterProvider {
  readonly id: RouterProviderId;
  readonly label: string;
  readonly description: string;
  readonly usageDescription: string;
  readonly usageSource: "cursor" | "external";
}

export const DEFAULT_ROUTER_PROVIDER: RouterProviderId = "cursor";
export const ROUTER_PROVIDER_PERSISTENCE_KEY = "settings.router-provider.v1";

export const ROUTER_PROVIDERS: readonly RouterProvider[] = [
  {
    id: "cursor",
    label: "Cursor",
    description: "Use your signed-in Cursor account and its hosted agent models.",
    usageDescription: "Included and on-demand usage from your Cursor account.",
    usageSource: "cursor"
  },
  {
    id: "claude-code",
    label: "Claude Code",
    description: "Use Anthropic's Claude Code provider for agent requests.",
    usageDescription: "Claude Code usage is managed by your Anthropic account and is not exposed as an in-app meter.",
    usageSource: "external"
  },
  {
    id: "codex",
    label: "Codex",
    description: "Use OpenAI's Codex provider for agent requests.",
    usageDescription: "Codex usage is managed by your OpenAI account and is not exposed as an in-app meter.",
    usageSource: "external"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Use models and billing from your OpenRouter account.",
    usageDescription: "OpenRouter usage and spend are managed in your OpenRouter account and are not exposed as an in-app meter.",
    usageSource: "external"
  }
];

const ROUTER_PROVIDER_IDS = new Set<RouterProviderId>(ROUTER_PROVIDERS.map((provider) => provider.id));

export function isRouterProviderId(value: unknown): value is RouterProviderId {
  return typeof value === "string" && ROUTER_PROVIDER_IDS.has(value as RouterProviderId);
}

export function routerProviderById(id: RouterProviderId): RouterProvider {
  return ROUTER_PROVIDERS.find((provider) => provider.id === id) ?? ROUTER_PROVIDERS[0]!;
}

export function parseRouterProviderPreference(raw: string | null): RouterProviderId {
  if (raw == null) return DEFAULT_ROUTER_PROVIDER;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value == null || Array.isArray(value)) return DEFAULT_ROUTER_PROVIDER;
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 1 || !isRouterProviderId(record.provider)) return DEFAULT_ROUTER_PROVIDER;
    return record.provider;
  } catch {
    return DEFAULT_ROUTER_PROVIDER;
  }
}

export type RouterProviderPersistence = Pick<AgentDesktopBridge["clientPersistence"], "read" | "write">;

export async function loadRouterProvider(persistence: RouterProviderPersistence): Promise<RouterProviderId> {
  return parseRouterProviderPreference(await persistence.read(ROUTER_PROVIDER_PERSISTENCE_KEY));
}

export async function saveRouterProvider(persistence: RouterProviderPersistence, provider: RouterProviderId): Promise<void> {
  if (!isRouterProviderId(provider)) throw new Error("Unknown router provider.");
  await persistence.write(ROUTER_PROVIDER_PERSISTENCE_KEY, JSON.stringify({ schemaVersion: 1, provider }));
}
