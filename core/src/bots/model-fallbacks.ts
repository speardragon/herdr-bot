import type { ModelEntry } from "./model-catalog.ts";

/**
 * User-provided pinned model choices for a `kind` whose model list can't be reliably queried from an
 * installed CLI (or whose CLI query just failed). Kept separate from `model-catalog.ts` so the
 * query/cache logic doesn't need to know where fallback data comes from.
 *
 * Deliberately empty: don't invent fixed model IDs speculatively. Populate a `kind` here only once
 * real user-confirmed IDs exist.
 */
const USER_FALLBACK_MODELS: Readonly<Record<string, readonly ModelEntry[]>> = {};

/** The user's pinned model choices for `kind`, or an empty list when none are configured. */
export function userFallbackModels(kind: string): readonly ModelEntry[] {
  return USER_FALLBACK_MODELS[kind] ?? [];
}
