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

test("forget bumps the epoch so a stale in-flight run's isCurrent() reads false, then nextEpoch resumes normally", async () => {
  const queue = new RunQueue();
  const epoch = queue.nextEpoch("r");
  let sawCurrentDuringRun: boolean | null = null;
  const run = queue.enqueue("r", async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    sawCurrentDuringRun = queue.currentEpoch("r") === epoch;
  });
  queue.forget("r");
  await run;
  assert.equal(sawCurrentDuringRun, false, "forget should invalidate the epoch the in-flight run captured");
  assert.equal(queue.isRunning("r"), false, "forget must not corrupt the running counter for an in-flight run");
  const nextEpoch = queue.nextEpoch("r");
  assert.equal(nextEpoch, epoch + 2, "forget bumps the epoch by 1; nextEpoch bumps it again");
  let ranAfterForget = false;
  await queue.enqueue("r", async () => { ranAfterForget = true; });
  assert.equal(ranAfterForget, true);
  assert.equal(queue.isRunning("r"), false);
});

test("forget drops the queue entry outright when nothing is running (the common delete path)", () => {
  const queue = new RunQueue();
  queue.nextEpoch("x");
  queue.forget("x");
  assert.equal(queue.currentEpoch("x"), 0, "the entry should be gone, not just bumped");
  assert.equal(queue.nextEpoch("x"), 1, "a fresh entry starts from epoch 0 again");
});
