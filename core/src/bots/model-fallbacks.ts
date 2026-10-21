import type { ModelEntry } from "./model-catalog.ts";

/**
 * User-provided pinned model choices for a `kind` whose model list can't be reliably queried from an
 * installed CLI (or whose CLI query just failed). Kept separate from `model-catalog.ts` so the
 * query/cache logic doesn't need to know where fallback data comes from.
 *
 * Don't invent fixed model IDs speculatively. Populate a `kind` here only once real user-confirmed IDs
 * exist. These are also merged into a successful CLI listing, so a pinned model is always offered.
 *
 * `agy`: Gemini 4 Argon, exactly as `agy models` (Antigravity CLI 1.4.3) lists it.
 */
const USER_FALLBACK_MODELS: Readonly<Record<string, readonly ModelEntry[]>> = {
  agy: [
    { id: "gemini-4-argon-high", label: "Gemini 4 Argon (High)" },
    { id: "gemini-4-argon-medium", label: "Gemini 4 Argon (Medium)" },
    { id: "gemini-4-argon-low", label: "Gemini 4 Argon (Low)" },
  ],
};

/** The user's pinned model choices for `kind`, or an empty list when none are configured. */
export function userFallbackModels(kind: string): readonly ModelEntry[] {
  return USER_FALLBACK_MODELS[kind] ?? [];
}
