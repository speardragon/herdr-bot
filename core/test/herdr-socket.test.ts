import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { subscribeHerdrEvents, type HerdrEvent } from "../src/herdr/socket.ts";
import { startFakeHerdrSocket } from "./helpers/fake-herdr-socket.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("subscribe acks then streams pushed events until closed", async () => {
  const temp = makeTempHome();
  const fake = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  try {
    const events: HerdrEvent[] = [];
    let closed = false;
    const ready = new Promise<void>((resolve) => {
      subscribeHerdrEvents(fake.path, [{ type: "pane.updated" }], {
        onEvent: (event) => events.push(event),
        onReady: resolve,
        onClose: () => { closed = true; },
      });
    });
    await ready;
    assert.deepEqual(fake.subscriptions[0], [{ type: "pane.updated" }]);
    fake.push("pane.updated", { pane_id: "w1:p1" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(events, [{ event: "pane.updated", data: { pane_id: "w1:p1" } }]);
    await fake.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(closed, true);
  } finally {
    await fake.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("a missing socket reports onClose with an error and never onReady", async () => {
  const temp = makeTempHome();
  try {
    const result = await new Promise<Error | null>((resolve) => {
      subscribeHerdrEvents(join(temp.home, "missing.sock"), [], { onEvent: () => undefined, onReady: () => resolve(new Error("unexpected ready")), onClose: resolve });
    });
    assert.ok(result instanceof Error);
  } finally {
    temp.cleanup();
  }
});
