import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAnswersHeld,
  getAuthor,
  getHeldFor,
  getLateInfo,
  getNoticeEvent,
  getPrompt,
  getPromptAnswer,
  getPromptStatus,
  getRawText,
  getReactions,
  getReplyTo,
  getStaleFor,
  groupReactions,
  isBotMessage,
  isMyReaction,
  isNotice,
  isPromptEntry,
  isRenderableMessage,
  isUserMessage,
} from "../src/features/conversation/entry-shapes.ts";
import type { TranscriptEntry } from "../src/data/types.ts";

function entry(kind: string, rest: Record<string, unknown> = {}): TranscriptEntry {
  return { id: "e1", kind, seq: 1, timestampMs: 0, ...rest };
}

test("kind guards", () => {
  assert.equal(isUserMessage(entry("message")), true);
  assert.equal(isBotMessage(entry("send-message")), true);
  assert.equal(isNotice(entry("notice")), true);
  assert.equal(isPromptEntry(entry("prompt")), true);
  assert.equal(isRenderableMessage(entry("message")), true);
  assert.equal(isRenderableMessage(entry("send-message")), true);
  assert.equal(isRenderableMessage(entry("notice")), false);
});

test("getAuthor validates shape", () => {
  assert.deepEqual(getAuthor(entry("message", { author: { id: "u", name: "Ray" } })), { id: "u", name: "Ray" });
  assert.equal(getAuthor(entry("message", { author: { id: "u" } })), null);
  assert.equal(getAuthor(entry("message")), null);
});

test("getRawText reads content/message.content, null for prompt", () => {
  assert.equal(getRawText(entry("message", { content: "hi" })), "hi");
  assert.equal(getRawText(entry("notice", { content: "note" })), "note");
  assert.equal(getRawText(entry("send-message", { message: { type: "text", content: "reply" } })), "reply");
  assert.equal(getRawText(entry("send-message", { message: { type: "other" } })), null);
  assert.equal(getRawText(entry("prompt", { prompt: { question: "q" } })), null);
});

test("getReactions filters malformed items, isMyReaction checks 'me'", () => {
  const reactions = getReactions(entry("send-message", { reactions: [{ emoji: "👍", by: "me" }, { emoji: "x" }, "garbage"] }));
  assert.deepEqual(reactions, [{ emoji: "👍", by: "me" }]);
  assert.equal(isMyReaction(reactions[0]!), true);
  assert.equal(isMyReaction({ emoji: "👍", by: "forge" }), false);
});

test("groupReactions aggregates by emoji, counts, and marks mine", () => {
  const groups = groupReactions([
    { emoji: "👍", by: "me" },
    { emoji: "👍", by: "forge" },
    { emoji: "🎉", by: "lens" },
  ]);
  assert.deepEqual(groups, [
    { emoji: "👍", count: 2, mine: true },
    { emoji: "🎉", count: 1, mine: false },
  ]);
});

test("groupReactions on an empty list", () => {
  assert.deepEqual(groupReactions([]), []);
});

test("getReplyTo / getHeldFor / late / stale / answersHeld", () => {
  assert.equal(getReplyTo(entry("message", { replyTo: "e0" })), "e0");
  assert.equal(getReplyTo(entry("message")), null);
  assert.deepEqual(getHeldFor(entry("message", { heldFor: ["forge", 1, "lens"] })), ["forge", "lens"]);
  assert.deepEqual(getLateInfo(entry("send-message", { late: true, lateAfterMs: 360_000 })), { late: true, lateAfterMs: 360_000 });
  assert.deepEqual(getLateInfo(entry("send-message")), { late: false, lateAfterMs: null });
  assert.equal(getStaleFor(entry("send-message", { staleFor: "e2" })), "e2");
  assert.equal(getAnswersHeld(entry("send-message", { answersHeld: "e3" })), "e3");
});

test("getNoticeEvent validates bot-renamed / bot-message-sent, rejects garbage", () => {
  assert.deepEqual(getNoticeEvent(entry("notice", { event: { type: "bot-renamed", oldName: "a", newName: "b" } })), { type: "bot-renamed", oldName: "a", newName: "b" });
  assert.deepEqual(getNoticeEvent(entry("notice", { event: { type: "bot-message-sent", targetChatId: "forge", targetName: "Forge", targetKind: "bot" } })), {
    type: "bot-message-sent",
    targetChatId: "forge",
    targetName: "Forge",
    targetKind: "bot",
  });
  assert.equal(getNoticeEvent(entry("notice", { event: { type: "bot-renamed" } })), null);
  assert.equal(getNoticeEvent(entry("notice")), null);
});

test("prompt status/answer/prompt accessors validate shape", () => {
  assert.equal(getPromptStatus(entry("prompt", { status: "pending" })), "pending");
  assert.equal(getPromptStatus(entry("prompt", { status: "bogus" })), null);
  assert.deepEqual(getPromptAnswer(entry("prompt", { answer: { kind: "option", key: "A", label: "Yes" } })), { kind: "option", key: "A", label: "Yes" });
  assert.deepEqual(getPromptAnswer(entry("prompt", { answer: { kind: "cancelled" } })), { kind: "cancelled" });
  assert.equal(getPromptAnswer(entry("prompt")), null);
  const prompt = { question: "Proceed?", options: [], signature: "sig-1" };
  assert.deepEqual(getPrompt(entry("prompt", { prompt })), prompt);
  assert.equal(getPrompt(entry("prompt", { prompt: { question: "q" } })), null);
});
