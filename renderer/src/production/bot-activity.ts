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
