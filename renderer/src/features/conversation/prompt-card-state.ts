/**
 * Derives how a `prompt` transcript entry (an approval/question card) should render, given
 * the bot's *live* blocked-prompt state (`ChatSummary.bot.pendingPrompt`). The stored entry is historical
 * -- it is only safe to answer inline when its `signature` still matches the bot's current live prompt;
 * otherwise the card either shows what was actually answered (if we know), or the inert "Answered in the
 * terminal" placeholder, a real, deliberate fallback state (not a bug).
 *
 * Pure, DOM-free -- unit tested directly with `node --test`.
 */
import type { PendingPrompt } from "../../data/types.ts";
import { getPrompt, getPromptAnswer, getPromptStatus } from "./entry-shapes.ts";
import type { PromptEntryAnswer } from "./entry-shapes.ts";
import type { TranscriptEntry } from "../../data/types.ts";

export type PromptCardMode = "live" | "answered" | "inert" | "hidden";

export interface PromptCardView {
  readonly mode: PromptCardMode;
  readonly prompt: PendingPrompt | null;
  readonly answer: PromptEntryAnswer | null;
}

const HIDDEN: PromptCardView = { mode: "hidden", prompt: null, answer: null };

/** `livePendingPrompt` is the chat's *current* `bot.pendingPrompt` (null if the chat isn't a bot, or the
 * bot isn't currently blocked on anything). */
export function derivePromptCardView(entry: TranscriptEntry, livePendingPrompt: PendingPrompt | null): PromptCardView {
  const prompt = getPrompt(entry);
  if (prompt == null) return HIDDEN;
  const status = getPromptStatus(entry);
  if (status === "superseded") return HIDDEN;

  if (livePendingPrompt != null && livePendingPrompt.signature === prompt.signature) {
    return { mode: "live", prompt: livePendingPrompt, answer: null };
  }

  const answer = getPromptAnswer(entry);
  if (status === "answered" && answer != null) {
    return { mode: "answered", prompt, answer };
  }
  // The host also tracks the chosen option directly on the stored prompt's own `options[].selected` --
  // use that as a second source for "what was answered" even if the entry's `answer` field is absent.
  if (status === "answered" && prompt.options.some((option) => option.selected)) {
    return { mode: "answered", prompt, answer: null };
  }

  return { mode: "inert", prompt, answer: null };
}

/** Seeds a multi-select question card's local checkbox state from `PendingPromptOption.checked` (`null`
 * for a single-select card, where there's nothing to seed). */
export function seedCheckedOptions(prompt: PendingPrompt): Record<string, boolean> {
  const seeded: Record<string, boolean> = {};
  if (!prompt.multiSelect) return seeded;
  for (const option of prompt.options) seeded[option.key] = option.checked === true;
  return seeded;
}

/**
 * The letter badge an option row renders ("A"/"B"/"C", not the
 * host's own raw `option.key` -- the host's numbering is terminal-numeric ("1"/"2"/"3", matching however
 * many lines preceded it in that bot's raw screen, e.g. `core/test/helpers/prompt-screens.ts`), purely
 * positional in the rendered list, regardless of what `option.key` actually is. `option.key` itself is
 * still what gets sent back in `prompt.answer`'s `key` param -- only the badge's own text changes. Wraps
 * to two letters past Z (26 options is already far beyond anything a real prompt renders, but a modulo
 * wrap avoids ever printing something nonsensical). */
export function optionBadgeLabel(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < letters.length) return letters[index]!;
  return letters[Math.floor(index / letters.length) - 1]! + letters[index % letters.length]!;
}
