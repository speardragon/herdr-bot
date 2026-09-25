/**
 * Parses the terminal screen of a `blocked` Claude Code pane into the approval / question form it is
 * showing, so the app can render it as a card and answer it with key presses instead of making the
 * user switch to the herdr pane.
 *
 * Shapes (verbatim captures live in core/test/blocked-prompt.test.ts):
 *
 *  - Permission: one rule, then a tool header ("Bash command"), body lines (command, description,
 *    permission-rule notes), "Do you want to proceed?", numbered options, an "Esc to cancel" footer.
 *  - AskUserQuestion: the form sits BETWEEN two rules -- tab strip ("☐ Color" / "←  ☒ Size  ☐ …  →"),
 *    question, numbered options (detail on the following line), "N. Type something." -- while the
 *    footer segment after the second rule only holds "N. Chat about this" and the key hints.
 *    Multi-select renders "[ ]"/"[✔]" checkboxes; multi-question ends on a "Review your answers"
 *    screen whose options are "Submit answers" / "Cancel".
 *  - Anything else herdr calls blocked (trust dialog, MCP Accept/Decline, "Enter to confirm" forms)
 *    has no numbered options and is reported as `kind: "unknown"` so the UI can at least say what
 *    the pane is waiting for and offer to open it.
 */

export type BlockedPromptKind = "permission" | "question" | "unknown";

export interface BlockedPromptOption {
  /** The hotkey Claude Code binds to this row -- what `agent send-keys` must send to pick it. */
  readonly key: string;
  readonly label: string;
  readonly detail: string | null;
  /** Row under the ❯ cursor. Cosmetic; not part of the signature. */
  readonly selected: boolean;
  /** Multi-select checkbox state; null on ordinary rows. Not part of the signature. */
  readonly checked: boolean | null;
}

export interface BlockedPromptProgress {
  readonly done: number;
  readonly total: number;
}

export interface BlockedPrompt {
  readonly kind: BlockedPromptKind;
  /** Permission prompts name the tool ("Bash command"); question forms have no separate title. */
  readonly title: string | null;
  /** The raw AskUserQuestion tab strip, when present. */
  readonly header: string | null;
  readonly progress: BlockedPromptProgress | null;
  readonly question: string;
  readonly body: readonly string[];
  readonly options: readonly BlockedPromptOption[];
  readonly multiSelect: boolean;
  /** Key of the "Type something" row, when the form accepts free text. */
  readonly freeTextKey: string | null;
  /** Identity of this form (kind/title/header/question/option labels) -- stable across cursor moves and
   * checkbox toggles, different for the next question of the same form. */
  readonly signature: string;
}

const RULE_LINE = /^\s*─{8,}\s*$/u;
const OPTION_LINE = /^\s*(❯)?\s*(\d+)\.\s+(?:\[([ ✔✓xX])\]\s+)?(.*?)\s*$/u;
const HINT_LINE = /esc to cancel|enter to select|enter to confirm|to navigate|tab to amend|ctrl\+[a-z]/iu;
const PROCEED_QUESTION = /do you want to proceed\?/iu;
const TAB_STRIP = /[☐☒]/u;
/** Leading quote bar on a long/wrapped question line; a line starting with it continues the question. */
const QUESTION_BAR = /^\s*│\s?/u;
/** "…question? Subtitle sentence." -> the sentence after the first question mark is a subtitle. */
const QUESTION_SPLIT = /^(.*?[?？])\s+(\S.*)$/u;
const FREE_TEXT_LABEL = /^type something\.?$/iu;
const CHAT_ABOUT_LABEL = /^chat about this$/iu;
const CHECKED_MARKS = new Set(["✔", "✓", "x", "X"]);

interface ParsedOptionLine {
  readonly key: string;
  readonly label: string;
  readonly selected: boolean;
  readonly checked: boolean | null;
}

function parseOptionLine(line: string): ParsedOptionLine | null {
  const match = OPTION_LINE.exec(line);
  if (match == null) return null;
  const [, cursor, key, box, label] = match;
  return { key: key!, label: label ?? "", selected: cursor != null, checked: box == null ? null : CHECKED_MARKS.has(box) };
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Splits the screen into the segments between horizontal rules (rules themselves excluded). */
function segments(lines: readonly string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (RULE_LINE.test(line)) {
      out.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  out.push(current);
  return out;
}

/** The paragraph above the options must be a question (a trailing subtitle sentence is allowed). */
function hasQuestionLine(segment: readonly string[], firstOption: number): boolean {
  return /[?？]$/u.test(questionBlock(segment, firstOption).question);
}

function collectOptions(segment: readonly string[], firstOption: number): { options: BlockedPromptOption[]; end: number } {
  const options: BlockedPromptOption[] = [];
  let end = firstOption;
  let sawBlankAfterLast = false;
  for (let i = firstOption; i < segment.length; i += 1) {
    const line = segment[i]!;
    const option = parseOptionLine(line);
    if (option != null) {
      options.push({ ...option, detail: null });
      end = i;
      sawBlankAfterLast = false;
      continue;
    }
    if (isBlank(line)) {
      sawBlankAfterLast = true;
      continue;
    }
    // A non-option, non-blank line directly under an option is that option's detail -- classified by
    // shape, not indent, because multi-select details sit at the same indent as unselected rows.
    if (sawBlankAfterLast || HINT_LINE.test(line) || options.length === 0) break;
    const last = options[options.length - 1]!;
    options[options.length - 1] = { ...last, detail: last.detail == null ? line.trim() : `${last.detail} ${line.trim()}` };
    end = i;
  }
  return { options, end };
}

function progressFromHeader(header: string): BlockedPromptProgress | null {
  const done = (header.match(/☒/gu) ?? []).length;
  const todo = (header.match(/☐/gu) ?? []).length;
  const total = done + todo;
  return total === 0 ? null : { done, total };
}

function nonBlank(lines: readonly string[]): string[] {
  return lines.filter((line) => !isBlank(line)).map((line) => line.trim());
}

export function blockedPromptSignature(prompt: Pick<BlockedPrompt, "kind" | "title" | "header" | "question" | "body" | "options">): string {
  return JSON.stringify([prompt.kind, prompt.title, prompt.header, prompt.question, prompt.body, prompt.options.map((option) => [option.key, option.label])]);
}

/**
 * The question is the paragraph right above the options: one line, or several when it wrapped (Claude
 * prefixes a long question with a "│" bar on every line). A second sentence after the question mark is
 * a subtitle, not part of the question, and goes to the body.
 */
function questionBlock(segment: readonly string[], firstOption: number): { question: string; subtitle: string | null; end: number } {
  let last = firstOption - 1;
  while (last >= 0 && isBlank(segment[last]!)) last -= 1;
  let start = last;
  while (start > 0 && !isBlank(segment[start - 1]!) && QUESTION_BAR.test(segment[start - 1]!)) start -= 1;
  const text = segment.slice(start, last + 1).map((line) => line.replace(QUESTION_BAR, "").trim()).join(" ");
  const split = QUESTION_SPLIT.exec(text);
  return split == null ? { question: text, subtitle: null, end: start } : { question: split[1]!, subtitle: split[2]!, end: start };
}

function buildForm(segment: readonly string[], firstOption: number): BlockedPrompt {
  const { options: rawOptions } = collectOptions(segment, firstOption);
  const options = rawOptions.filter((option) => !CHAT_ABOUT_LABEL.test(option.label));
  const { question, subtitle, end } = questionBlock(segment, firstOption);
  const above = nonBlank(segment.slice(0, end));
  const kind: BlockedPromptKind = PROCEED_QUESTION.test(question) ? "permission" : "question";
  const first = above[0] ?? null;
  const header = kind === "question" && first != null && TAB_STRIP.test(first) ? first : null;
  const title = kind === "permission" ? first : null;
  const body = [...(first == null ? [] : (header != null || title != null ? above.slice(1) : above)), ...(subtitle == null ? [] : [subtitle])];
  const freeText = options.find((option) => FREE_TEXT_LABEL.test(option.label)) ?? null;
  const base = { kind, title, header, question, body, options };
  return {
    ...base,
    progress: header == null ? null : progressFromHeader(header),
    multiSelect: options.some((option) => option.checked != null),
    freeTextKey: freeText?.key ?? null,
    signature: blockedPromptSignature(base),
  };
}

function buildUnknown(lines: readonly string[]): BlockedPrompt | null {
  const parts = segments(lines);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const content = nonBlank(parts[i]!).filter((line) => !HINT_LINE.test(line));
    if (content.length === 0) continue;
    const base = { kind: "unknown" as const, title: null, header: null, question: content[0]!, body: content.slice(1, 13), options: [] };
    return { ...base, progress: null, multiSelect: false, freeTextKey: null, signature: blockedPromptSignature(base) };
  }
  return null;
}

/**
 * Returns the form the screen is showing, or null when nothing on it looks like one (an idle prompt
 * box, a working turn). Only call it for a pane herdr reports as `blocked`: the "unknown" fallback
 * deliberately trusts that verdict and describes whatever sits under the last rule.
 */
export function parseBlockedPrompt(screen: string): BlockedPrompt | null {
  const lines = screen.split("\n").map((line) => line.replace(/\s+$/u, ""));
  const parts = segments(lines);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const segment = parts[i]!;
    const firstOption = segment.findIndex((line) => parseOptionLine(line) != null);
    if (firstOption < 0 || !hasQuestionLine(segment, firstOption)) continue;
    return buildForm(segment, firstOption);
  }
  if (!lines.some((line) => HINT_LINE.test(line))) return null;
  return buildUnknown(lines);
}
