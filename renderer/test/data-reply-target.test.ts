import { test } from "node:test";
import assert from "node:assert/strict";
import { clearReplyTarget, getReplyTarget, resetReplyTargetsForTests, setReplyTarget } from "../src/data/reply-target.ts";

test("setReplyTarget stores a target keyed by chatId", () => {
  resetReplyTargetsForTests();
  setReplyTarget("chat-1", { entryId: "entry-1", authorName: "Forge", preview: "hey there" });
  assert.deepEqual(getReplyTarget("chat-1"), { entryId: "entry-1", authorName: "Forge", preview: "hey there" });
  assert.equal(getReplyTarget("chat-2"), null);
});

test("setReplyTarget for one chat does not clobber another chat's target", () => {
  resetReplyTargetsForTests();
  setReplyTarget("chat-1", { entryId: "entry-1", authorName: "Forge", preview: "a" });
  setReplyTarget("chat-2", { entryId: "entry-2", authorName: "Lens", preview: "b" });
  assert.equal(getReplyTarget("chat-1")?.entryId, "entry-1");
  assert.equal(getReplyTarget("chat-2")?.entryId, "entry-2");
});

test("clearReplyTarget empties just that chat's target and is idempotent", () => {
  resetReplyTargetsForTests();
  setReplyTarget("chat-1", { entryId: "entry-1", authorName: "Forge", preview: "a" });
  setReplyTarget("chat-2", { entryId: "entry-2", authorName: "Lens", preview: "b" });
  clearReplyTarget("chat-1");
  assert.equal(getReplyTarget("chat-1"), null);
  assert.equal(getReplyTarget("chat-2")?.entryId, "entry-2");
  clearReplyTarget("chat-1"); // must not throw when already empty
  assert.equal(getReplyTarget("chat-1"), null);
});
