import { test } from "node:test";
import assert from "node:assert/strict";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("view state tracks incoming/outgoing activity, seq-based reads, and manual unread", () => {
  const temp = makeTempHome();
  try {
    const store = new ViewStateStore(temp.home);
    assert.deepEqual(store.get("room-x"), { lastViewedAt: 0, lastActivityAt: 0, isManuallyUnread: false, lastReadSeq: 0, lastIncomingSeq: 0, lastMessageAt: 0 });
    store.recordOutgoing("room-x", 10);
    store.recordIncoming("room-x", 2, 15);
    assert.equal(store.get("room-x").lastIncomingSeq, 2);
    assert.equal(store.get("room-x").lastReadSeq, 0);
    store.applyRead("room-x", 2, 2, 20);
    store.setManuallyUnread("room-x", true);
    const reloaded = new ViewStateStore(temp.home).get("room-x");
    assert.deepEqual(reloaded, { lastViewedAt: 20, lastActivityAt: 15, isManuallyUnread: true, lastReadSeq: 2, lastIncomingSeq: 2, lastMessageAt: 15 });
    store.applyRead("room-x", 2, 2, 30);
    assert.equal(store.get("room-x").isManuallyUnread, false);
    store.delete("room-x");
    assert.equal(store.get("room-x").lastReadSeq, 0);
  } finally {
    temp.cleanup();
  }
});

test("an old acknowledgement cannot roll lastReadSeq back once a newer one has landed", () => {
  const temp = makeTempHome();
  try {
    const store = new ViewStateStore(temp.home);
    store.recordIncoming("room-y", 5, 10);
    store.applyRead("room-y", 4, 5, 20);
    assert.equal(store.get("room-y").lastReadSeq, 4);
    store.applyRead("room-y", 2, 5, 30);
    assert.equal(store.get("room-y").lastReadSeq, 4);
  } finally {
    temp.cleanup();
  }
});

test("hasSeqFields/migrateSeqFields backfill an old store that predates seq tracking", () => {
  const temp = makeTempHome();
  try {
    const store = new ViewStateStore(temp.home);
    assert.equal(store.hasSeqFields("room-z"), false);
    // Simulate an old-format store written before seq fields existed.
    store.setManuallyUnread("room-z", true);
    assert.equal(store.hasSeqFields("room-z"), false);
    const migrated = store.migrateSeqFields("room-z", { lastReadSeq: 3, lastIncomingSeq: 5, lastMessageAt: 999 });
    assert.deepEqual(migrated, { lastViewedAt: 0, lastActivityAt: 0, isManuallyUnread: true, lastReadSeq: 3, lastIncomingSeq: 5, lastMessageAt: 999 });
    assert.equal(store.hasSeqFields("room-z"), true);
    // A second migration attempt would be a caller bug (should only run once), but the store itself
    // stays idempotent: re-applying the same computed fields does not change anything.
    assert.deepEqual(store.migrateSeqFields("room-z", { lastReadSeq: 3, lastIncomingSeq: 5, lastMessageAt: 999 }), migrated);
  } finally {
    temp.cleanup();
  }
});
