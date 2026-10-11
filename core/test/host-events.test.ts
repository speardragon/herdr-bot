import { test } from "node:test";
import assert from "node:assert/strict";
import { HostEvents } from "../src/host-events.ts";
import { setLogSink } from "../src/log.ts";

test("emit calls every listener even when an earlier one throws, and never throws itself", () => {
  const events = new HostEvents();
  const logged: string[] = [];
  setLogSink((line) => logged.push(line));
  try {
    let secondCalled = false;
    events.on("agents", () => {
      throw new Error("boom");
    });
    events.on("agents", () => {
      secondCalled = true;
    });
    assert.doesNotThrow(() => events.emit("agents", { ok: true }));
    assert.equal(secondCalled, true);
    assert.ok(logged.some((line) => line.includes("herdr-bot:events") && line.includes("boom")), JSON.stringify(logged));
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
  }
});
