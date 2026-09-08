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
    const settled = await deps.cli.agentPrompt({ target: args.botId, text: args.prompt, wait: true, timeoutMs: deps.turnTimeoutMs });
    return { outcome: settled?.agent_status === "blocked" ? "blocked" : "settled", spoken: turn.close() };
  } catch (error) {
    const outcome = outcomeFromError(error);
    log("turn", `turn for ${args.botId} in ${args.chatId} ended with ${outcome}`, error instanceof Error ? error.message : String(error));
    return { outcome, spoken: turn.close() };
  } finally {
    await deps.mirror.refresh();
  }
}
