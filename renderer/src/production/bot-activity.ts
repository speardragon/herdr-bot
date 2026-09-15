// herdr-bot: validation of the bot's herdr runtime status as carried on RendererAgent.runtimeStatus.
// The sidebar's status dot (sidebar-status-dot.ts) reads that validated value directly -- there is no
// separate activity/afterglow state: whatever herdr reports (idle / working / done / blocked) is shown.

/** herdr-bot: statuses the host's StatusMirror/BotRuntime can report (see core/src/herdr/types.ts's
 * BotRuntimeStatus). Anything else collapses to "unknown" so the status dot never lights up on an
 * unrecognized value. Exported so RendererAgent's projection (model.ts) and the dot model agree on
 * exactly the same validated status domain. */
export const RUNTIME_STATUSES = new Set(["idle", "working", "blocked", "done", "unknown", "offline"]);

/**
 * Validates a raw, untyped `herdrBot.status` value (and ONLY that value -- never `isRunning` or
 * `currentActivity`, which are a separate, older pipeline that drives the avatar persona animation)
 * into the runtime-status domain the rest of the renderer understands. Anything not in
 * `RUNTIME_STATUSES` -- wrong type, unrecognized string, missing field -- collapses to `"unknown"`.
 *
 * Lives here (not model.ts, which has extensionless imports `node --test` cannot resolve) so it stays
 * independently unit-testable.
 */
export function projectRuntimeStatus(rawStatus: unknown): string {
  return typeof rawStatus === "string" && RUNTIME_STATUSES.has(rawStatus) ? rawStatus : "unknown";
}
