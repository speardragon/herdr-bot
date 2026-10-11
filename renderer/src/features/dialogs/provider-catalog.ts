/**
 * The curated subset of the host's much larger `SUPPORTED_KINDS` enum this picker actually offers
 * (Claude Code, Codex, Grok CLI, Gemini CLI, OpenCode -- 5 of the host's ~23 kinds), plus
 * each provider's model/reasoning-effort capability flags: model selection is only meaningful for
 * `claude, codex, grok, gemini, opencode`; reasoning-effort only for `claude, codex, grok`. Pure module
 * (no DOM/React/asset imports) so it is unit-testable directly; the icon asset itself is resolved by the
 * component layer (`ProviderSelect.tsx`) from `iconSlug`.
 */

export interface ProviderDescriptor {
  readonly id: string;
  readonly label: string;
  /** `public/provider-icons/<slug>.svg`, or `null` when no Simple Icons glyph exists (Grok -- see
   * `renderer/public/provider-icons/NOTICE.md`), in which case the UI falls back to a monogram badge. */
  readonly iconSlug: string | null;
  readonly supportsModel: boolean;
  readonly supportsReasoning: boolean;
}

export const PROVIDERS: readonly ProviderDescriptor[] = [
  { id: "claude", label: "Claude Code", iconSlug: "claude", supportsModel: true, supportsReasoning: true },
  { id: "codex", label: "Codex", iconSlug: "codex", supportsModel: true, supportsReasoning: true },
  { id: "grok", label: "Grok CLI", iconSlug: null, supportsModel: true, supportsReasoning: true },
  { id: "gemini", label: "Gemini CLI", iconSlug: "gemini", supportsModel: true, supportsReasoning: false },
  { id: "opencode", label: "OpenCode", iconSlug: "opencode", supportsModel: true, supportsReasoning: false },
];

export const DEFAULT_PROVIDER_ID = "claude";

export function findProvider(id: string | null | undefined): ProviderDescriptor {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS.find((provider) => provider.id === DEFAULT_PROVIDER_ID)!;
}

export function providerSupportsModel(id: string | null | undefined): boolean {
  return findProvider(id).supportsModel;
}

export function providerSupportsReasoning(id: string | null | undefined): boolean {
  return findProvider(id).supportsReasoning;
}

/** The monogram shown in place of an icon for a provider with no Simple Icons glyph (just Grok today). */
export function providerMonogram(provider: ProviderDescriptor): string {
  return provider.label.slice(0, 1).toUpperCase();
}
