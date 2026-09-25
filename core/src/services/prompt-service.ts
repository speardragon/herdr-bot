import type { HerdrCli } from "../herdr/cli.ts";
import { parseBlockedPrompt, type BlockedPrompt } from "../herdr/blocked-prompt.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import { HerdrError } from "../herdr/types.ts";

export type PromptErrorCode = "not_blocked" | "prompt_changed" | "invalid_answer" | "answer_in_flight" | "herdr_error";

export class PromptError extends Error {
  readonly code: PromptErrorCode;

  constructor(code: PromptErrorCode, message: string) {
    super(message);
    this.name = "PromptError";
    this.code = code;
  }
}

/** What the user did on the card. Keys are the digits Claude Code prints in front of each row. */
export type PromptAnswer =
  | { readonly action: "option"; readonly key: string }
  | { readonly action: "text"; readonly text: string }
  /** Multi-select rows toggle on their digit and Enter only re-toggles the cursor row, so moving on is
   * a Tab (next question, or the "Review your answers" screen). */
  | { readonly action: "next" }
  /** Esc: Claude Code records "User declined" / "Interrupted" and the agent carries on unblocked. */
  | { readonly action: "cancel" };

export interface PromptServiceDeps {
  readonly cli: HerdrCli;
  readonly mirror: StatusMirror;
  /** Told what was answered (after the keys went through) so the transcript card can collapse to it. */
  readonly onAnswered?: (botId: string, answer: PromptAnswer, prompt: BlockedPrompt) => void;
  /** Injectable so tests do not wait between the key presses of a free-text answer. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Claude Code treats input that arrives in quick succession as one paste, so an Enter right behind
 * the typed text is swallowed into it instead of submitting; observed to submit reliably at ~1s gaps
 * and to be swallowed at 100ms. */
const TEXT_SETTLE_MS = 500;

/** `detection` is the plain-text bottom buffer herdr's own blocked-state rules matched against, so it
 * is exactly the screen the parser's fixtures were captured from. 80 rows covers a 40-row pane plus a
 * long permission card that scrolled part of itself off. */
export const PROMPT_READ_LINES = 80;

export function readBlockedPrompt(cli: HerdrCli, botId: string): Promise<BlockedPrompt | null> {
  return cli.agentRead(botId, PROMPT_READ_LINES, "detection").then(parseBlockedPrompt);
}

/** Claude Code's inline text field submits on Enter, so a newline in the answer would send it early. */
function singleLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/gu, " ").trim();
}

function validate(prompt: BlockedPrompt, answer: PromptAnswer): void {
  if (answer.action === "option" && !prompt.options.some((option) => option.key === answer.key)) {
    throw new PromptError("invalid_answer", `the prompt has no option "${answer.key}"`);
  }
  if (answer.action === "text") {
    if (prompt.freeTextKey == null) throw new PromptError("invalid_answer", "this prompt does not take a typed answer");
    if (singleLine(answer.text).length === 0) throw new PromptError("invalid_answer", "the typed answer is empty");
  }
  if (answer.action === "next" && !prompt.multiSelect) throw new PromptError("invalid_answer", "only a multi-select question moves on with Next");
}

/**
 * Answers the approval/question form a blocked bot is showing by pressing its keys through herdr.
 *
 * Every answer re-checks the live pane right before typing (status still blocked, same form as the
 * card the user clicked): keys sent to an unblocked Claude land in its prompt box as text, and a
 * multi-question form auto-advances on a digit, so a stale card must never be answered.
 */
export class PromptService {
  readonly #deps: PromptServiceDeps;
  readonly #inFlight = new Set<string>();

  constructor(deps: PromptServiceDeps) {
    this.#deps = deps;
  }

  /** True while a free-text answer is mid-sequence for that bot (the mirror keeps its previous prompt). */
  isAnswering(botId: string): boolean {
    return this.#inFlight.has(botId);
  }

  async answer(botId: string, signature: string, answer: PromptAnswer): Promise<void> {
    if (this.#inFlight.has(botId)) throw new PromptError("answer_in_flight", `${botId} is still being answered`);
    const runtime = this.#deps.mirror.get(botId);
    if (runtime.status !== "blocked" || runtime.prompt == null) throw new PromptError("not_blocked", `${botId} is not waiting for an answer`);
    if (runtime.prompt.signature !== signature) throw new PromptError("prompt_changed", `${botId}'s prompt has changed since it was shown`);
    validate(runtime.prompt, answer);
    this.#inFlight.add(botId);
    try {
      const paneId = await this.#confirmLive(botId, signature, runtime.paneId);
      await this.#press(botId, paneId, runtime.prompt, answer);
      this.#deps.onAnswered?.(botId, answer, runtime.prompt);
    } catch (error) {
      if (error instanceof PromptError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new PromptError("herdr_error", error instanceof HerdrError ? `herdr: ${message}` : message);
    } finally {
      this.#inFlight.delete(botId);
      void this.#deps.mirror.refresh();
    }
  }

  async #confirmLive(botId: string, signature: string, paneId: string | null): Promise<string> {
    const live = await this.#deps.cli.agentGet(botId);
    if (live.agent_status !== "blocked") throw new PromptError("not_blocked", `${botId} is no longer waiting for an answer`);
    const current = await readBlockedPrompt(this.#deps.cli, botId);
    if (current == null || current.signature !== signature) throw new PromptError("prompt_changed", `${botId}'s prompt has changed since it was shown`);
    return paneId ?? live.pane_id;
  }

  async #press(botId: string, paneId: string, prompt: BlockedPrompt, answer: PromptAnswer): Promise<void> {
    const { cli } = this.#deps;
    switch (answer.action) {
      case "option": return cli.agentSendKeys(botId, [answer.key]);
      case "next": return cli.agentSendKeys(botId, ["tab"]);
      case "cancel": return cli.agentSendKeys(botId, ["esc"]);
      case "text": {
        // Digit -> the row turns into an inline field -> typed text -> Enter, as three herdr calls.
        await cli.agentSendKeys(botId, [prompt.freeTextKey!]);
        await this.#sleep(TEXT_SETTLE_MS);
        await cli.paneSendText(paneId, singleLine(answer.text));
        await this.#sleep(TEXT_SETTLE_MS);
        await cli.agentSendKeys(botId, ["enter"]);
        // If the Enter was still folded into the paste, the form is unchanged with our text in the
        // selected row; one more Enter submits it.
        await this.#sleep(TEXT_SETTLE_MS);
        const after = await readBlockedPrompt(cli, botId).catch(() => null);
        if (after != null && (await cli.agentGet(botId)).agent_status === "blocked" && after.options.find((option) => option.selected)?.key === prompt.freeTextKey) {
          await cli.agentSendKeys(botId, ["enter"]);
        }
        return;
      }
    }
  }

  #sleep(ms: number): Promise<void> {
    return (this.#deps.sleep ?? ((delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay))))(ms);
  }
}
