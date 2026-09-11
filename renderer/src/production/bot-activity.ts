// herdr-bot: independent green "working/done" activity indicator (task 3, chat-interaction-polish).
// This model is deliberately decoupled from the blue unread-dot / seq-based read state: it only ever
// reacts to the bot's raw runtime status (RendererAgent.runtimeStatus), never to hasUnread/lastReadSeq.

export interface ActivityState {
  readonly status: string;
  readonly visibleUntil: number;
}

/**
 * `working -> done` is the only transition that grants a 5s afterglow (`visibleUntil = now + 5_000`).
 * Any other transition into "done" (including the very first observation) resolves to `visibleUntil: 0`,
 * i.e. no afterglow. Re-observing the same status is a no-op that returns the previous state by
 * reference, so a repeated "done" upsert from the host never restarts (or extends) the fade timer.
 */
export function updateActivity(previous: ActivityState | undefined, status: string, now: number): ActivityState {
  if (previous?.status === status) return previous;
  return { status, visibleUntil: status === "done" && previous?.status === "working" ? now + 5_000 : 0 };
}

/** True while actively working, or during the "done" afterglow window. Any other status (blocked,
 * offline, idle, unknown) is never visible, even if a stale ActivityState object still says "done". */
export function activityVisible(state: ActivityState, now: number): boolean {
  return state.status === "working" || (state.status === "done" && now < state.visibleUntil);
}

/** herdr-bot: statuses the host's StatusMirror/BotRuntime can report (see core/src/herdr/types.ts's
 * BotRuntimeStatus). Anything else collapses to "unknown" so the green working dot never lights up
 * on an unrecognized value. Exported so RendererAgent's projection (model.ts) and this module agree
 * on exactly the same validated status domain. */
export const RUNTIME_STATUSES = new Set(["idle", "working", "blocked", "done", "unknown", "offline"]);

/**
 * Validates a raw, untyped `herdrBot.status` value (and ONLY that value -- never `isRunning` or
 * `currentActivity`, which are a separate, older pipeline that drives the avatar persona animation)
 * into the runtime-status domain the rest of this module understands. Anything not in
 * `RUNTIME_STATUSES` -- wrong type, unrecognized string, missing field -- collapses to `"unknown"`.
 *
 * Lives here (not model.ts, which has extensionless imports `node --test` cannot resolve) so it stays
 * independently unit-testable.
 */
export function projectRuntimeStatus(rawStatus: unknown): string {
  return typeof rawStatus === "string" && RUNTIME_STATUSES.has(rawStatus) ? rawStatus : "unknown";
}

export type ActivityMap = ReadonlyMap<string, ActivityState>;

/**
 * Recomputes the whole activity map from the latest known status per chat id. Owned at the root
 * lifecycle (not per sidebar row): ids missing from `statuses` (a reworked/deleted chat, or a roster
 * that no longer includes it) are dropped, so cleanup falls out of always passing the complete
 * current roster rather than needing an explicit delete hook.
 */
export function reconcileActivityMap(previous: ActivityMap, statuses: ReadonlyMap<string, string>, now: number): ActivityMap {
  const next = new Map<string, ActivityState>();
  for (const [id, status] of statuses) {
    next.set(id, updateActivity(previous.get(id), status, now));
  }
  return next;
}

/**
 * The earliest future `visibleUntil` across the map, i.e. when the single root-owned re-render timer
 * should next fire so an expired "done" afterglow disappears even without a new host event. `null`
 * when nothing is currently fading out.
 */
export function nextActivityTimeout(map: ActivityMap, now: number): number | null {
  let earliest: number | null = null;
  for (const state of map.values()) {
    if (state.status !== "done" || state.visibleUntil <= now) continue;
    if (earliest == null || state.visibleUntil < earliest) earliest = state.visibleUntil;
  }
  return earliest;
}

/**
 * The status a sidebar row's green dot should show for `id` -- `"working"` while actively working,
 * `"done"` during the 5s afterglow, or `null` when the dot must be hidden. `null` covers every
 * "nothing to show" case uniformly: no entry in the map, an entry whose status is blocked/offline/
 * idle/unknown, an expired "done" afterglow, AND a disconnected transport (task 3's "on lost
 * connection, hide the dot and show stale" -- the caller's separate stale-UI path, e.g.
 * `isHostReachable`, is what actually renders the "stale" indication).
 */
export function resolveActivityStatus(map: ActivityMap, id: string, transportConnected: boolean, now: number): "working" | "done" | null {
  if (!transportConnected) return null;
  const state = map.get(id);
  if (state == null || !activityVisible(state, now)) return null;
  return state.status === "working" ? "working" : "done";
}
