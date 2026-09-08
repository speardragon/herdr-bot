import { test } from "node:test";
import assert from "node:assert/strict";
import { isRoomId, isValidBotId, makeRoomId, slugify, suggestBotId } from "../src/model/ids.ts";

test("bot ids follow herdr agent name rules and never use the room prefix", () => {
  assert.equal(isValidBotId("reviewer"), true);
  assert.equal(isValidBotId("r2-d2_x"), true);
  assert.equal(isValidBotId("Reviewer"), false);
  assert.equal(isValidBotId("9lives"), false);
  assert.equal(isValidBotId("a".repeat(33)), false);
  assert.equal(isValidBotId("room-ok"), false);
});

test("suggestBotId derives a valid id from a display name", () => {
  assert.equal(suggestBotId("Code Reviewer"), "code-reviewer");
  assert.equal(suggestBotId("2nd Opinion"), "bot-2nd-opinion");
  assert.equal(suggestBotId("리뷰어"), "bot");
});

test("room ids are prefixed, slugged, and suffixed", () => {
  assert.equal(makeRoomId("Auth refactor", "1a2b"), "room-auth-refactor-1a2b");
  assert.equal(makeRoomId("리뷰", "1a2b"), "room-chat-1a2b");
  assert.equal(isRoomId("room-chat-1a2b"), true);
  assert.equal(isRoomId("reviewer"), false);
  assert.equal(slugify("Hello,  World!!"), "hello-world");
});
