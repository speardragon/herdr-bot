import { test } from "node:test";
import assert from "node:assert/strict";
import { presenceMembers, sidebarWaitingReason, statusDotTone, statusPhraseKind } from "../src/data/status.ts";
import type { ChatSummary } from "../src/data/types.ts";

function bot(patch: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "b",
    kind: "bot",
    name: "Bot",
    description: "",
    title: "",
    avatarShape: null,
    avatarColor: null,
    createdAt: 0,
    updatedAt: 0,
    isRunning: false,
    currentActivity: null,
    lastMessagePreview: null,
    lastMessageId: null,
    hasUnread: false,
    unreadCount: 0,
    lastViewedAt: 0,
    lastActivityAt: 0,
    lastReadSeq: 0,
    lastIncomingSeq: 0,
    lastMessageAt: 0,
    awaitingUserResponse: null,
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: false,
    isGroup: false,
    memberIds: [],
    bot: null,
    ...patch,
  };
}

test("statusDotTone is blocked when awaitingUserResponse is set", () => {
  assert.equal(statusDotTone(bot({ awaitingUserResponse: { reason: "approval" } })), "blocked");
});

test("statusDotTone is working when running, idle (null) otherwise", () => {
  assert.equal(statusDotTone(bot({ isRunning: true })), "working");
  assert.equal(statusDotTone(bot()), null);
});

test("statusDotTone is always null for a room", () => {
  assert.equal(statusDotTone(bot({ kind: "room", awaitingUserResponse: { reason: "approval" }, isRunning: true })), null);
});

test("sidebarWaitingReason mirrors the reason, only for a bot", () => {
  assert.equal(sidebarWaitingReason(bot({ awaitingUserResponse: { reason: "offline" } })), "offline");
  assert.equal(sidebarWaitingReason(bot()), null);
  assert.equal(sidebarWaitingReason(bot({ kind: "room", awaitingUserResponse: { reason: "offline" } })), null);
});

test("statusPhraseKind maps approval before working", () => {
  assert.equal(statusPhraseKind(bot({ awaitingUserResponse: { reason: "approval" }, isRunning: true })), "needsApproval");
});

test("presenceMembers omits idle members and keeps order", () => {
  const members = [bot({ name: "Atlas" }), bot({ name: "Forge", awaitingUserResponse: { reason: "approval" } }), bot({ name: "Lens", isRunning: true })];
  assert.deepEqual(presenceMembers(members), [
    { name: "Forge", phrase: "needsApproval" },
    { name: "Lens", phrase: "working" },
  ]);
});
