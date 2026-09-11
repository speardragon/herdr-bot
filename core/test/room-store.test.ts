import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomStore, projectRoomConfig } from "../src/store/room-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleRoom } from "./helpers/fixtures.ts";

test("room store round-trips and dedupes member ids on project", () => {
  const temp = makeTempHome();
  try {
    const store = new RoomStore(temp.home);
    store.save(sampleRoom());
    assert.deepEqual(store.get("room-auth-1a2b")?.memberIds, ["reviewer", "fixer"]);
    assert.equal(store.list().length, 1);
    store.delete("room-auth-1a2b");
    assert.equal(store.list().length, 0);
  } finally {
    temp.cleanup();
  }
});

test("projectRoomConfig validates shape", () => {
  assert.equal(projectRoomConfig({ id: "room-x" }), null);
  assert.deepEqual(projectRoomConfig({ ...sampleRoom(), memberIds: ["a", "a", "b"] })?.memberIds, ["a", "b"]);
});

test("room store round-trips an optional creationRequestId", () => {
  const temp = makeTempHome();
  try {
    const store = new RoomStore(temp.home);
    const requestId = "11111111-1111-1111-1111-111111111111";
    store.save(sampleRoom({ creationRequestId: requestId }));
    assert.equal(store.get("room-auth-1a2b")?.creationRequestId, requestId);
    assert.equal(store.get("room-auth-1a2b")?.creationRequestId, requestId);
    assert.equal(projectRoomConfig(sampleRoom())?.creationRequestId, undefined);
  } finally {
    temp.cleanup();
  }
});
