import { test } from "node:test";
import assert from "node:assert/strict";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("view state tracks activity vs viewed and manual unread", () => {
  const temp = makeTempHome();
  try {
    const store = new ViewStateStore(temp.home);
    assert.deepEqual(store.get("room-x"), { lastViewedAt: 0, lastActivityAt: 0, isManuallyUnread: false });
    store.markActivity("room-x", 10);
    store.markViewed("room-x", 20);
    store.setManuallyUnread("room-x", true);
    const reloaded = new ViewStateStore(temp.home).get("room-x");
    assert.deepEqual(reloaded, { lastViewedAt: 20, lastActivityAt: 10, isManuallyUnread: true });
    store.markViewed("room-x", 30);
    assert.equal(store.get("room-x").isManuallyUnread, false);
    store.delete("room-x");
    assert.equal(store.get("room-x").lastViewedAt, 0);
  } finally {
    temp.cleanup();
  }
});
