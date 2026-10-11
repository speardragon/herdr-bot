import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftStore, createMemoryDraftStorage } from "../src/data/drafts.ts";

test("get() returns empty string for a chat with no draft", () => {
  const store = createDraftStore(createMemoryDraftStorage());
  assert.equal(store.get("chat-1"), "");
});

test("set() then get() round-trips, per chat id", () => {
  const store = createDraftStore(createMemoryDraftStorage());
  store.set("chat-1", "hello");
  store.set("chat-2", "world");
  assert.equal(store.get("chat-1"), "hello");
  assert.equal(store.get("chat-2"), "world");
});

test("set() with empty text clears the draft (removeItem), not stores an empty string", () => {
  let removed = false;
  const storage = createMemoryDraftStorage();
  const originalRemove = storage.removeItem.bind(storage);
  storage.removeItem = (key) => {
    removed = true;
    originalRemove(key);
  };
  const store = createDraftStore(storage);
  store.set("chat-1", "hello");
  store.set("chat-1", "");
  assert.equal(removed, true);
  assert.equal(store.get("chat-1"), "");
});

test("a throwing storage degrades to empty/no-op rather than crashing", () => {
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  const store = createDraftStore(throwing);
  assert.equal(store.get("chat-1"), "");
  assert.doesNotThrow(() => store.set("chat-1", "x"));
  assert.doesNotThrow(() => store.clear("chat-1"));
});
