// herdr-bot: the single status dot drawn over a sidebar avatar's bottom-right corner.
//
// Its color ("tone") comes straight from the bot's herdr runtime status (RendererAgent.runtimeStatus,
// validated by bot-activity.ts's projectRuntimeStatus) -- idle / working / done / blocked -- with no
// afterglow or hiding: whatever herdr reports is what the user sees. The only thing that can override
// it is an unread message, and only in layouts that have nowhere else to put the blue dot.

export type SidebarDotTone = "working" | "done" | "blocked" | "unread";
export type SidebarDotLayout = "expanded" | "collapsed" | "pinned";

/** Idle is the resting state and draws no dot at all: only activity (working), a finished turn (done)
 * or a bot waiting on the user (blocked) earns one. */
const STATUS_TONES: ReadonlySet<string> = new Set(["working", "done", "blocked"]);

/**
 * The runtime-status half of the dot: working / done / blocked, or `null` when there is nothing to
 * show -- idle, "unknown"/"offline"/missing, or a disconnected transport (the caller's separate
 * stale-UI path, e.g. `isHostReachable`, renders that case).
 */
export function runtimeStatusTone(runtimeStatus: string | undefined, transportConnected: boolean): SidebarDotTone | null {
  if (!transportConnected || runtimeStatus == null || !STATUS_TONES.has(runtimeStatus)) return null;
  return runtimeStatus as SidebarDotTone;
}

export interface SidebarDotInput {
  readonly runtimeStatus: string | undefined;
  readonly hasUnread: boolean | undefined;
  readonly layout: SidebarDotLayout;
  readonly transportConnected: boolean;
}

/**
 * What the avatar dot shows. An expanded row has a trailing column for the blue unread dot, so its
 * avatar dot is always the runtime status. A pinned tile or collapsed row has only the avatar dot, so
 * an unread message paints it blue (host-owned state -- it does not depend on the transport) and the
 * runtime status is hidden behind it until the chat is read.
 */
export function sidebarDotTone({ runtimeStatus, hasUnread, layout, transportConnected }: SidebarDotInput): SidebarDotTone | null {
  if (hasUnread === true && layout !== "expanded") return "unread";
  return runtimeStatusTone(runtimeStatus, transportConnected);
}
