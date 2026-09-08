import { test } from "node:test";
import assert from "node:assert/strict";
import { RunQueue } from "../src/services/run-queue.ts";

test("runs per chat are serialized and epochs advance", async () => {
  const queue = new RunQueue();
  const order: string[] = [];
  const e1 = queue.nextEpoch("r");
  const e2 = queue.nextEpoch("r");
  assert.equal(e2, e1 + 1);
  assert.equal(queue.currentEpoch("r"), e2);
  const first = queue.enqueue("r", async () => { order.push("a-start"); await new Promise((r) => setTimeout(r, 30)); order.push("a-end"); });
  const second = queue.enqueue("r", async () => { order.push("b"); });
  assert.equal(queue.isRunning("r"), true);
  await Promise.all([first, second]);
  assert.deepEqual(order, ["a-start", "a-end", "b"]);
  assert.equal(queue.isRunning("r"), false);
});

test("a failing run does not poison the queue", async () => {
  const queue = new RunQueue();
  await queue.enqueue("r", async () => { throw new Error("boom"); }).catch(() => undefined);
  let ran = false;
  await queue.enqueue("r", async () => { ran = true; });
  assert.equal(ran, true);
});
