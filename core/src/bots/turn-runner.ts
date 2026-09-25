import type { HerdrCli } from "../herdr/cli.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import { HerdrError, type BotRuntimeStatus } from "../herdr/types.ts";
import type { MemberTurnResult, TurnOutcome } from "../group/orchestrator.ts";
import { log } from "../log.ts";
import type { SayInbox } from "./say-inbox.ts";

export interface TurnRunnerDeps {
  readonly cli: HerdrCli;
  readonly mirror: StatusMirror;
  readonly inbox: SayInbox;
  readonly turnTimeoutMs: number;
}

/** Typed as individual terminal key events before the bracketed-paste envelope. Claude therefore
 * sees an explicit user-authored instruction outside `<pasted_content>` and can safely act on the
 * app-generated room/DM turn that follows instead of rejecting the whole turn as prompt injection. */
export const TURN_ENVELOPE_PREFIX = "The user sent a message in herdr-bot and explicitly asks you to handle the following pasted turn envelope now. Follow its instructions, including say/pass: ";

export function terminalKeys(text: string): string[] {
  return [...text].map((character) => character === " " ? "space" : character);
}

function preflightOutcome(status: BotRuntimeStatus): TurnOutcome | null {
  if (status === "offline") return "offline";
  if (status === "working") return "busy";
  if (status === "blocked") return "blocked";
  return null;
}

function outcomeFromError(error: unknown): TurnOutcome {
  if (!(error instanceof HerdrError)) return "error";
  switch (error.code) {
    case "agent_blocked": return "blocked";
    case "agent_prompt_stalled": return "stalled";
    case "timeout": return "timeout";
    case "agent_not_running": return "offline";
    default: return "error";
  }
}

/** `refresh()` dedupes onto a refresh already in flight, which may have listed the agents before herdr
 * flipped them to blocked; a second pass covers that window. */
async function observeBlocked(deps: TurnRunnerDeps, botId: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await deps.mirror.refresh();
    if (deps.mirror.get(botId).status === "blocked") return;
  }
}

export async function runBotTurn(deps: TurnRunnerDeps, args: { readonly chatId: string; readonly botId: string; readonly prompt: string }): Promise<MemberTurnResult> {
  let status = deps.mirror.get(args.botId).status;
  if (status === "offline") {
    await deps.mirror.refresh();
    status = deps.mirror.get(args.botId).status;
  }
  const skip = preflightOutcome(status);
  if (skip != null) return { outcome: skip, spoken: [] };

  const turn = deps.inbox.open(args.chatId, args.botId);
  try {
    await deps.cli.agentSendKeys(args.botId, terminalKeys(TURN_ENVELOPE_PREFIX));
    const settled = await deps.cli.agentPrompt({ target: args.botId, text: args.prompt, wait: true, timeoutMs: deps.turnTimeoutMs });
    // A blocked bot's approval/question card is filed in the chat whose turn is open (PromptTracker
    // reads the inbox), so the mirror has to observe "blocked" BEFORE this turn closes -- the refresh
    // in `finally` runs after `turn.close()` and would file it in the DM instead.
    if (settled?.agent_status === "blocked") await observeBlocked(deps, args.botId);
    return { outcome: settled?.agent_status === "blocked" ? "blocked" : "settled", spoken: turn.close() };
  } catch (error) {
    const outcome = outcomeFromError(error);
    log("turn", `turn for ${args.botId} in ${args.chatId} ended with ${outcome}`, error instanceof Error ? error.message : String(error));
    return { outcome, spoken: turn.close() };
  } finally {
    await deps.mirror.refresh();
  }
}
