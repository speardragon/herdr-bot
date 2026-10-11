import { test } from "node:test";
import assert from "node:assert/strict";
import { clearJumpTarget, peekJumpTarget, requestJumpToMessage, resetJumpTargetForTests } from "../src/data/jump-target.ts";

test("requestJumpToMessage records chatId/entryId and an increasing token", () => {
  resetJumpTargetForTests();
  requestJumpToMessage("chat-1", "entry-1");
  const first = peekJumpTarget();
  assert.deepEqual(first && { chatId: first.chatId, entryId: first.entryId }, { chatId: "chat-1", entryId: "entry-1" });

  requestJumpToMessage("chat-1", "entry-2");
  const second = peekJumpTarget();
  assert.equal(second?.entryId, "entry-2");
  assert.ok(second != null && first != null && second.token > first.token, "token must strictly increase across requests");
});

test("clearJumpTarget empties the current request and is idempotent", () => {
  resetJumpTargetForTests();
  requestJumpToMessage("chat-1", "entry-1");
  clearJumpTarget();
  assert.equal(peekJumpTarget(), null);
  clearJumpTarget(); // must not throw when already empty
  assert.equal(peekJumpTarget(), null);
});

test("requestJumpToMessage for the same entry again still bumps the token (re-triggerable)", () => {
  resetJumpTargetForTests();
  requestJumpToMessage("chat-1", "entry-1");
  const first = peekJumpTarget();
  requestJumpToMessage("chat-1", "entry-1");
  const second = peekJumpTarget();
  assert.ok(second != null && first != null && second.token > first.token);
});
