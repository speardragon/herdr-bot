import { test } from "node:test";
import assert from "node:assert/strict";
import { updateActivity, activityVisible, reconcileActivityMap, nextActivityTimeout, resolveActivityStatus, projectRuntimeStatus, RUNTIME_STATUSES } from "../src/production/bot-activity.ts";

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

test("resolveActivityStatus: working is shown while the transport is connected", () => {
  const map = reconcileActivityMap(new Map(), new Map([["a", "working"]]), 0);
  assert.equal(resolveActivityStatus(map, "a", true, 0), "working");
});

test("resolveActivityStatus: done is shown within the 5s afterglow, hidden once it expires", () => {
  const working = reconcileActivityMap(new Map(), new Map([["a", "working"]]), 0);
  const done = reconcileActivityMap(working, new Map([["a", "done"]]), 100); // visibleUntil 5_100
  assert.equal(resolveActivityStatus(done, "a", true, 5_099), "done");
  assert.equal(resolveActivityStatus(done, "a", true, 5_100), null);
});

test("resolveActivityStatus: blocked/offline (and an id absent from the map) are hidden", () => {
  const working = reconcileActivityMap(new Map(), new Map([["a", "working"]]), 0);
  const blocked = reconcileActivityMap(working, new Map([["a", "blocked"]]), 100);
  assert.equal(resolveActivityStatus(blocked, "a", true, 100), null);
  const offline = reconcileActivityMap(new Map(), new Map([["b", "offline"]]), 0);
  assert.equal(resolveActivityStatus(offline, "b", true, 0), null);
  assert.equal(resolveActivityStatus(new Map(), "missing", true, 0), null, "no entry at all for this id");
});

test("resolveActivityStatus: a disconnected transport hides the dot even for an actively-working bot", () => {
  const working = reconcileActivityMap(new Map(), new Map([["a", "working"]]), 0);
  assert.equal(resolveActivityStatus(working, "a", false, 0), null);
});

test("projectRuntimeStatus: every member of RUNTIME_STATUSES passes through unchanged", () => {
  for (const status of RUNTIME_STATUSES) assert.equal(projectRuntimeStatus(status), status);
});

test("projectRuntimeStatus: a garbage/invalid status collapses to \"unknown\"", () => {
  assert.equal(projectRuntimeStatus("busy"), "unknown", "a string outside the valid domain");
  assert.equal(projectRuntimeStatus(""), "unknown", "an empty string");
  assert.equal(projectRuntimeStatus(undefined), "unknown", "missing entirely");
  assert.equal(projectRuntimeStatus(null), "unknown", "null");
  assert.equal(projectRuntimeStatus(42), "unknown", "the wrong type");
  assert.equal(projectRuntimeStatus(true), "unknown", "a boolean, e.g. a stray isRunning value");
});

test("projectRuntimeStatus takes ONLY the raw status value -- wiring isRunning/currentActivity into it would fail this", () => {
  // The interface requirement is "projected only from raw herdrBot.status". This locks the single
  // parameter to exactly that value: an isRunning-shaped boolean or a currentActivity-shaped object
  // must never leak through as a recognized status, even though those looked like plausible "working"
  // signals under the OLD isRunning/currentActivity pipeline (still used only by the avatar persona,
  // never by this projection).
  assert.equal(projectRuntimeStatus(true), "unknown", "an isRunning=true boolean is not the status \"working\"");
  assert.equal(projectRuntimeStatus({ verb: "working" }), "unknown", "a currentActivity-shaped object is not a status string");
});
