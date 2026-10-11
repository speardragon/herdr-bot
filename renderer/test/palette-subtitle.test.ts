import { test } from "node:test";
import assert from "node:assert/strict";
import { messageHitSubtitle } from "../src/features/palette/subtitle.ts";

test("messageHitSubtitle: a room match is always 'room', regardless of role", () => {
  assert.deepEqual(messageHitSubtitle({ role: "assistant", author: "Forge", chatName: "Checkout rate limits" }, true), {
    kind: "room",
    chatName: "Checkout rate limits",
  });
  assert.deepEqual(messageHitSubtitle({ role: "user", author: "", chatName: "Checkout rate limits" }, true), {
    kind: "room",
    chatName: "Checkout rate limits",
  });
});

test("messageHitSubtitle: a DM hit from the bot reads 'dmFromBot'", () => {
  assert.deepEqual(messageHitSubtitle({ role: "assistant", author: "Scout", chatName: "Scout" }, false), { kind: "dmFromBot", author: "Scout" });
});

test("messageHitSubtitle: a DM hit from the user reads 'dmFromYou'", () => {
  assert.deepEqual(messageHitSubtitle({ role: "user", author: "", chatName: "Scout" }, false), { kind: "dmFromYou", chatName: "Scout" });
});
