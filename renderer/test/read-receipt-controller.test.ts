import { test } from "node:test";
import assert from "node:assert/strict";
import { canAcknowledge, createReadReceiptController } from "../src/production/read-receipt-controller.ts";
import { applyRead, hasUnread } from "../../core/src/model/read-state.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("canAcknowledge gates on all four conditions", () => {
  assert.equal(canAcknowledge(true, true, true, true), true);
  assert.equal(canAcknowledge(false, true, true, true), false);
  assert.equal(canAcknowledge(true, false, true, true), false);
  assert.equal(canAcknowledge(true, true, false, true), false, "backgrounded window must not ack");
  assert.equal(canAcknowledge(true, true, true, false), false, "unfocused window must not ack");
});

test("acknowledge sends the exact loaded seq, not the summary's latest seq: cache revisit does not re-send an already-acked watermark", async () => {
  const calls: number[] = [];
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => { calls.push(throughSeq); return { lastReadSeq: throughSeq }; }
  });
  await controller.acknowledge("chat-a", 4);
  assert.equal(controller.ackedSeqFor("chat-a"), 4);
  // Revisiting the (cached) chat re-renders the same loaded page; re-acking the same watermark is a no-op.
  await controller.acknowledge("chat-a", 4);
  assert.deepEqual(calls, [4]);
});

test("inactive-window incoming: loaded=4 while a newer message (seq 5) has arrived leaves the chat unread until seq 5 is loaded and acked", async () => {
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => ({ lastReadSeq: throughSeq })
  });
  // Only the page through seq 4 was ever rendered (the window was backgrounded when seq 5 arrived).
  await controller.acknowledge("chat-a", 4);
  const afterPartialLoad = applyRead({ lastReadSeq: 0, lastIncomingSeq: 5, isManuallyUnread: false }, controller.ackedSeqFor("chat-a"), 5);
  assert.equal(afterPartialLoad.lastReadSeq, 4);
  assert.equal(hasUnread(afterPartialLoad), true, "seq 5 has not been loaded/acked yet");

  // Focus returns and the renderer catches up, loading through seq 5.
  await controller.acknowledge("chat-a", 5);
  const afterFocusReturn = applyRead(afterPartialLoad, controller.ackedSeqFor("chat-a"), 5);
  assert.equal(afterFocusReturn.lastReadSeq, 5);
  assert.equal(hasUnread(afterFocusReturn), false);
});

test("background window: canAcknowledge blocks the call the wiring would otherwise make", async () => {
  const calls: number[] = [];
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => { calls.push(throughSeq); return { lastReadSeq: throughSeq }; }
  });
  const selected = true, loaded = true, visible = false, focused = true; // window backgrounded
  if (canAcknowledge(selected, loaded, visible, focused)) await controller.acknowledge("chat-a", 4);
  assert.deepEqual(calls, []);
  assert.equal(controller.ackedSeqFor("chat-a"), 0);
});

test("fast A -> B chat switch: each chat's watermark is tracked independently", async () => {
  const calls: Array<[string, number]> = [];
  const controller = createReadReceiptController({
    markChatRead: async (id, throughSeq) => { calls.push([id, throughSeq]); return { lastReadSeq: throughSeq }; }
  });
  await Promise.all([controller.acknowledge("chat-a", 3), controller.acknowledge("chat-b", 7)]);
  assert.equal(controller.ackedSeqFor("chat-a"), 3);
  assert.equal(controller.ackedSeqFor("chat-b"), 7);
  assert.deepEqual(new Set(calls.map((c) => c[0])), new Set(["chat-a", "chat-b"]));
});

test("ACK failure leaves the chat unread; a later retry (e.g. after reconnect) succeeds", async () => {
  let attempt = 0;
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => {
      attempt += 1;
      if (attempt === 1) throw new Error("network down");
      return { lastReadSeq: throughSeq };
    }
  });
  await controller.acknowledge("chat-a", 4);
  assert.equal(controller.ackedSeqFor("chat-a"), 0, "a failed ACK must not move the watermark");
  // Reconnect / next chat-open retries with the same (or a since-updated) watermark.
  await controller.acknowledge("chat-a", 4);
  assert.equal(controller.ackedSeqFor("chat-a"), 4);
});

test("same-ms receive: two seq-ordered acknowledgements for the same chat settle at the higher watermark, never regress", async () => {
  const calls: number[] = [];
  const first = deferred<{ lastReadSeq: number }>();
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => {
      calls.push(throughSeq);
      if (throughSeq === 6) return await first.promise;
      return { lastReadSeq: throughSeq };
    }
  });
  const ack6 = controller.acknowledge("chat-a", 6); // in flight
  const ack7 = controller.acknowledge("chat-a", 7); // arrives (same ms) while 6 is in flight -- queued
  first.resolve({ lastReadSeq: 6 });
  await ack6;
  await ack7;
  assert.equal(controller.ackedSeqFor("chat-a"), 7);
  assert.deepEqual(calls, [6, 7]);
});

test("a queued watermark lower than the in-flight one is dropped, not sent", async () => {
  const calls: number[] = [];
  const first = deferred<{ lastReadSeq: number }>();
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => {
      calls.push(throughSeq);
      if (throughSeq === 8) return await first.promise;
      return { lastReadSeq: throughSeq };
    }
  });
  const ack8 = controller.acknowledge("chat-a", 8);
  await controller.acknowledge("chat-a", 5); // stale/lower than in-flight -- must not queue or send
  first.resolve({ lastReadSeq: 8 });
  await ack8;
  assert.deepEqual(calls, [8]);
  assert.equal(controller.ackedSeqFor("chat-a"), 8);
});

test("explicit watermark expectations: loaded=4/newIncoming=5 acks 4 with unread true; focus-return loaded=5 acks 5 with unread false", async () => {
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => ({ lastReadSeq: throughSeq })
  });
  await controller.acknowledge("chat-a", 4);
  assert.equal(controller.ackedSeqFor("chat-a"), 4);
  assert.equal(hasUnread({ lastReadSeq: controller.ackedSeqFor("chat-a"), lastIncomingSeq: 5, isManuallyUnread: false }), true);

  await controller.acknowledge("chat-a", 5);
  assert.equal(controller.ackedSeqFor("chat-a"), 5);
  assert.equal(hasUnread({ lastReadSeq: controller.ackedSeqFor("chat-a"), lastIncomingSeq: 5, isManuallyUnread: false }), false);
});

test("forget() drops a chat's watermark so a reused id (delete + recreate) is not stuck behind the old chat's ACKs", async () => {
  const calls: number[] = [];
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => { calls.push(throughSeq); return { lastReadSeq: throughSeq }; }
  });
  await controller.acknowledge("chat-a", 50);
  assert.equal(controller.ackedSeqFor("chat-a"), 50);
  controller.forget("chat-a");
  assert.equal(controller.ackedSeqFor("chat-a"), 0);
  // The id is reused by a brand-new chat starting back at seq 1: without forget(), 3 <= 50 would be a no-op.
  await controller.acknowledge("chat-a", 3);
  assert.equal(controller.ackedSeqFor("chat-a"), 3);
  assert.deepEqual(calls, [50, 3]);
});

test("reset() drops every chat's watermark but leaves the controller usable (e.g. the signed-in account changed)", async () => {
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => ({ lastReadSeq: throughSeq })
  });
  await Promise.all([controller.acknowledge("chat-a", 3), controller.acknowledge("chat-b", 7)]);
  controller.reset();
  assert.equal(controller.ackedSeqFor("chat-a"), 0);
  assert.equal(controller.ackedSeqFor("chat-b"), 0);
  await controller.acknowledge("chat-a", 1);
  assert.equal(controller.ackedSeqFor("chat-a"), 1);
});

test("dispose() stops further ACKs from taking effect", async () => {
  const controller = createReadReceiptController({
    markChatRead: async (_id, throughSeq) => ({ lastReadSeq: throughSeq })
  });
  controller.dispose();
  await controller.acknowledge("chat-a", 4);
  assert.equal(controller.ackedSeqFor("chat-a"), 0);
});
