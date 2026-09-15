import { test } from "node:test";
import assert from "node:assert/strict";
import { projectRuntimeStatus, RUNTIME_STATUSES } from "../src/production/bot-activity.ts";

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
