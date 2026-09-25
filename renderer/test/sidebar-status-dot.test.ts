import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeStatusTone, sidebarDotTone } from "../src/production/sidebar-status-dot.ts";

// herdr-bot: the dot at the avatar's bottom-right reflects the bot's herdr runtime status (working /
// done / blocked) directly -- no afterglow. Idle is the resting state and shows no dot; "unknown"/
// "offline", and a disconnected transport, show nothing either (the stale-UI path owns that state).
test("runtimeStatusTone maps working/done/blocked and hides idle and everything else", () => {
  assert.equal(runtimeStatusTone("idle", true), null, "an idle bot has no dot");
  assert.equal(runtimeStatusTone("working", true), "working");
  assert.equal(runtimeStatusTone("done", true), "done");
  assert.equal(runtimeStatusTone("blocked", true), "blocked");
  assert.equal(runtimeStatusTone("unknown", true), null);
  assert.equal(runtimeStatusTone("offline", true), null);
  assert.equal(runtimeStatusTone(undefined, true), null);
  assert.equal(runtimeStatusTone("working", false), null, "a disconnected transport hides the dot");
});

// A new message: an expanded row shows it as a separate blue dot at the far right (the trailing
// column), so its avatar dot keeps showing the runtime status. A pinned tile and a collapsed row have
// no trailing column, so their one avatar dot turns blue, and the status tone yields until read.
test("sidebarDotTone: unread turns the avatar dot blue everywhere except the expanded row", () => {
  assert.equal(sidebarDotTone({ runtimeStatus: "working", hasUnread: true, layout: "pinned", transportConnected: true }), "unread");
  assert.equal(sidebarDotTone({ runtimeStatus: "working", hasUnread: true, layout: "collapsed", transportConnected: true }), "unread");
  assert.equal(sidebarDotTone({ runtimeStatus: "working", hasUnread: true, layout: "expanded", transportConnected: true }), "working");
  assert.equal(sidebarDotTone({ runtimeStatus: "idle", hasUnread: false, layout: "pinned", transportConnected: true }), null, "idle draws nothing");
  assert.equal(sidebarDotTone({ runtimeStatus: "idle", hasUnread: true, layout: "pinned", transportConnected: true }), "unread", "but unread still paints the tile dot blue");
  assert.equal(sidebarDotTone({ runtimeStatus: "unknown", hasUnread: true, layout: "pinned", transportConnected: true }), "unread", "unread still shows on a tile with no runtime status");
  assert.equal(sidebarDotTone({ runtimeStatus: "unknown", hasUnread: false, layout: "pinned", transportConnected: true }), null);
  assert.equal(sidebarDotTone({ runtimeStatus: "working", hasUnread: true, layout: "pinned", transportConnected: false }), "unread", "unread is host state, not live runtime state -- it survives a dropped transport");
  assert.equal(sidebarDotTone({ runtimeStatus: "working", hasUnread: undefined, layout: "expanded", transportConnected: true }), "working");
});
