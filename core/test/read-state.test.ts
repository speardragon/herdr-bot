import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRead, hasUnread } from "../src/model/read-state.ts";

test("old acknowledgement cannot consume newer messages", () => {
  const state = { lastReadSeq: 3, lastIncomingSeq: 5, isManuallyUnread: true };
  const read = applyRead(state, 4, 5);
  assert.equal(read.lastReadSeq, 4);
  assert.equal(hasUnread(read), true);
  assert.equal(hasUnread(applyRead(read, 5, 5)), false);
  assert.equal(applyRead(read, 2, 5).lastReadSeq, 4);
});
