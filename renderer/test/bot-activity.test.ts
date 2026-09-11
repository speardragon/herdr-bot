import { test } from "node:test";
import assert from "node:assert/strict";
import { updateActivity, activityVisible, reconcileActivityMap, nextActivityTimeout } from "../src/production/bot-activity.ts";

test("done fades five seconds after working, without restarting on repeats", () => {
  const working = updateActivity(undefined, "working", 0);
  const done = updateActivity(working, "done", 100);
  assert.equal(activityVisible(done, 5_099), true);
  assert.equal(activityVisible(done, 5_100), false);
  assert.deepEqual(updateActivity(done, "done", 2_000), done);
  assert.equal(activityVisible(updateActivity(undefined, "done", 0), 0), false);
  assert.equal(activityVisible(updateActivity(done, "blocked", 200), 200), false);
});

test("reconcileActivityMap: a repeated upsert with the same status is a no-op (same reference, timer not extended)", () => {
  const working = reconcileActivityMap(new Map(), new Map([["a", "working"]]), 0);
  const done = reconcileActivityMap(working, new Map([["a", "done"]]), 100); // working -> done grants the afterglow
  const repeated = reconcileActivityMap(done, new Map([["a", "done"]]), 4_000); // a later, unrelated "done" upsert
  assert.equal(repeated.get("a"), done.get("a"), "must be the SAME ActivityState object -- visibleUntil must not move");
});

test("reconcileActivityMap: a chat missing from the latest statuses (reworked/deleted) is pruned from the map", () => {
  const withTwo = reconcileActivityMap(new Map(), new Map([["a", "working"], ["b", "working"]]), 0);
  assert.deepEqual([...withTwo.keys()].sort(), ["a", "b"]);
  const afterDelete = reconcileActivityMap(withTwo, new Map([["a", "working"]]), 10);
  assert.deepEqual([...afterDelete.keys()], ["a"]);
});

test("reconcileActivityMap: reconnecting from an empty map never grants an already-done snapshot an afterglow", () => {
  // Simulates the root clearing the map on disconnect, then reconciling the reconnect snapshot: since
  // there is no memory of a prior "working" status, "done" resolves with no afterglow.
  const reconnected = reconcileActivityMap(new Map(), new Map([["a", "done"]]), 0);
  assert.equal(activityVisible(reconnected.get("a")!, 0), false);
});

test("nextActivityTimeout: the earliest pending done-afterglow expiry, or null when nothing is fading", () => {
  const empty = reconcileActivityMap(new Map(), new Map([["a", "working"]]), 0);
  assert.equal(nextActivityTimeout(empty, 0), null, "no chat is in its done afterglow yet");
  const afterA = reconcileActivityMap(empty, new Map([["a", "done"]]), 100); // a: visibleUntil 5_100
  const withB = reconcileActivityMap(reconcileActivityMap(afterA, new Map([["a", "done"], ["b", "working"]]), 200), new Map([["a", "done"], ["b", "done"]]), 300); // b: visibleUntil 5_300
  assert.equal(nextActivityTimeout(withB, 300), 5_100, "a's earlier expiry wins over b's later one");
  assert.equal(nextActivityTimeout(withB, 5_100), 5_300, "once a has already expired, only b's still-future expiry counts");
  assert.equal(nextActivityTimeout(withB, 5_300), null, "nothing left pending once both have expired");
});
