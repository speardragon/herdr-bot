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

test("a rejected subscription preserves the herdr error code", async () => {
  const temp = makeTempHome();
  const fake = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  try {
    fake.missingPanes.add("w5:p1");
    const error = await new Promise<Error | null>((resolve) => {
      subscribeHerdrEvents(fake.path, [{ type: "pane.agent_status_changed", pane_id: "w5:p1" }], {
        onEvent: () => undefined,
        onReady: () => resolve(new Error("unexpected ready")),
        onClose: resolve,
      });
    });
    assert.ok(error instanceof Error);
    assert.equal((error as unknown as { code: string }).code, "pane_not_found");
    assert.equal(error.message, "pane w5:p1 not found");
  } finally {
    await fake.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("a handshake that never acks times out and closes exactly once", async () => {
  const temp = makeTempHome();
  const fake = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  fake.holdHandshake = true;
  try {
    let closeCount = 0;
    let lastError: Error | null = null;
    await new Promise<void>((resolve) => {
      subscribeHerdrEvents(fake.path, [{ type: "pane.updated" }], {
        onEvent: () => undefined,
        onReady: () => { throw new Error("unexpected ready"); },
        onClose: (error) => { closeCount++; lastError = error; resolve(); },
      }, { handshakeTimeoutMs: 30 });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(closeCount, 1);
    assert.equal((lastError as unknown as { code: string } | null)?.code, "handshake_timeout");
  } finally {
    await fake.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("close() invoked by the caller reports onClose exactly once, with no error", async () => {
  const temp = makeTempHome();
  const fake = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  try {
    let closeCount = 0;
    let lastError: Error | null | undefined;
    const subscription = await new Promise<{ close(): void }>((resolve) => {
      const sub = subscribeHerdrEvents(fake.path, [{ type: "pane.updated" }], {
        onEvent: () => undefined,
        onReady: () => resolve(sub),
        onClose: (error) => { closeCount++; lastError = error; },
      });
    });
    subscription.close();
    subscription.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(closeCount, 1);
    assert.equal(lastError, null);
  } finally {
    await fake.close().catch(() => undefined);
    temp.cleanup();
  }
});
