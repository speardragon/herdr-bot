import { test } from "node:test";
import assert from "node:assert/strict";
import { planStackedAvatar } from "../src/data/room-avatar.ts";
import type { ChatSummary } from "../src/data/types.ts";

function member(id: string): ChatSummary {
  return { id, kind: "bot", name: id, description: "", title: "", avatarShape: null, avatarColor: null, createdAt: 0, updatedAt: 0, isRunning: false, currentActivity: null, lastMessagePreview: null, lastMessageId: null, hasUnread: false, unreadCount: 0, lastViewedAt: 0, lastActivityAt: 0, lastReadSeq: 0, lastIncomingSeq: 0, lastMessageAt: 0, awaitingUserResponse: null, notifyOnUpdatesEnabled: true, isHiddenFromSidebar: false, isGroup: false, memberIds: [], bot: null };
}

test("3 or fewer members: all shown, no overflow", () => {
  const plan = planStackedAvatar([member("a"), member("b"), member("c")]);
  assert.equal(plan.shown.length, 3);
  assert.equal(plan.overflowCount, 0);
});

test("4+ members: 2 shown plus an overflow count", () => {
  const plan = planStackedAvatar([member("a"), member("b"), member("c"), member("d")]);
  assert.equal(plan.shown.length, 2);
  assert.equal(plan.overflowCount, 2);
});

test("8-member room (many-members case)", () => {
  const plan = planStackedAvatar(Array.from({ length: 8 }, (_, i) => member(`m${i}`)));
  assert.equal(plan.shown.length, 2);
  assert.equal(plan.overflowCount, 6);
});
