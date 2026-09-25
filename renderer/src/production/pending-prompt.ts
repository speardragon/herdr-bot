// herdr-bot: the renderer-side view of a blocked bot's approval/question form. The host reads the
// pane, parses it (core/src/herdr/blocked-prompt.ts) and ships it inside a "prompt" transcript entry
// (and as `herdrBot.prompt` on the summary); this validates that untyped payload into what
// PromptEntryCard renders and what the `herdrBot.answerPrompt` RPC needs back (row `key` + `signature`).

export type PendingPromptKind = "permission" | "question" | "unknown";

export interface PendingPromptOption {
  /** The digit Claude Code binds to the row; sent back verbatim as the answer. */
  readonly key: string;
  readonly label: string;
  readonly detail: string | null;
  /** Multi-select checkbox state; null on ordinary rows. */
  readonly checked: boolean | null;
}

export interface PendingPrompt {
  readonly kind: PendingPromptKind;
  readonly title: string | null;
  readonly question: string;
  readonly body: readonly string[];
  readonly progress: { readonly done: number; readonly total: number } | null;
  /** Pickable rows -- the "Type something" row is split out as `freeTextKey`, since the card renders
   * it as the text field at the bottom rather than as a lettered option. */
  readonly options: readonly PendingPromptOption[];
  readonly multiSelect: boolean;
  readonly freeTextKey: string | null;
  readonly signature: string;
}

const KINDS: ReadonlySet<string> = new Set(["permission", "question", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function projectOption(value: unknown): PendingPromptOption | null {
  if (!isRecord(value) || typeof value.key !== "string" || value.key.length === 0 || typeof value.label !== "string") return null;
  return { key: value.key, label: value.label, detail: stringOrNull(value.detail), checked: typeof value.checked === "boolean" ? value.checked : null };
}

function projectProgress(value: unknown): PendingPrompt["progress"] {
  if (!isRecord(value) || typeof value.done !== "number" || typeof value.total !== "number" || value.total <= 0) return null;
  return { done: value.done, total: value.total };
}

/** Validates a host BlockedPrompt payload (from `herdrBot.prompt` or a "prompt" transcript entry).
 * Every option must be valid -- a half-parsed list would answer the wrong row. */
export function projectPromptShape(value: unknown): PendingPrompt | null {
  if (!isRecord(value)) return null;
  const raw = value;
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind)) return null;
  const question = stringOrNull(raw.question);
  const signature = stringOrNull(raw.signature);
  if (question == null || signature == null || !Array.isArray(raw.options)) return null;
  const options = raw.options.map(projectOption);
  if (options.some((option) => option == null)) return null;
  const freeTextKey = stringOrNull(raw.freeTextKey);
  return {
    kind: raw.kind as PendingPromptKind,
    title: stringOrNull(raw.title),
    question,
    body: Array.isArray(raw.body) ? raw.body.filter((line): line is string => typeof line === "string") : [],
    progress: projectProgress(raw.progress),
    options: (options as PendingPromptOption[]).filter((option) => option.key !== freeTextKey),
    multiSelect: raw.multiSelect === true,
    freeTextKey,
    signature,
  };
}

/** The row badge: A, B, C … like the reference design (the host keeps the terminal's digits as keys). */
export function optionLetter(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}
