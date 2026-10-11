import { test } from "node:test";
import assert from "node:assert/strict";
import { orderChats, visibleChats } from "../src/features/sidebar/order-chats.ts";
import type { ChatSummary } from "../src/data/types.ts";

function chat(overrides: Partial<ChatSummary> & Pick<ChatSummary, "id" | "lastActivityAt">): ChatSummary {
  return {
    kind: "bot",
    name: overrides.id,
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
    lastReadSeq: 0,
    lastIncomingSeq: 0,
    lastMessageAt: overrides.lastActivityAt,
    awaitingUserResponse: null,
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: false,
    isGroup: false,
    memberIds: [],
    bot: null,
    ...overrides,
  };
}

test("visibleChats drops hidden chats except the currently active one", () => {
  const chats = [chat({ id: "a", lastActivityAt: 1 }), chat({ id: "b", lastActivityAt: 2, isHiddenFromSidebar: true })];
  assert.deepEqual(
    visibleChats(chats, null).map((c) => c.id),
    ["a"],
  );
  assert.deepEqual(
    visibleChats(chats, "b").map((c) => c.id),
    ["a", "b"],
  );
});

test("orderChats splits pinned from unpinned, each sorted newest-activity-first", () => {
  const chats = [
    chat({ id: "old", lastActivityAt: 1 }),
    chat({ id: "new", lastActivityAt: 3 }),
    chat({ id: "pinned-old", lastActivityAt: 2 }),
    chat({ id: "pinned-new", lastActivityAt: 4 }),
  ];
  const result = orderChats(chats, ["pinned-old", "pinned-new"]);
  assert.deepEqual(
    result.pinned.map((c) => c.id),
    ["pinned-new", "pinned-old"],
  );
  assert.deepEqual(
    result.rest.map((c) => c.id),
    ["new", "old"],
  );
});

test("orderChats with no pins returns everything in rest, sorted", () => {
  const chats = [chat({ id: "a", lastActivityAt: 5 }), chat({ id: "b", lastActivityAt: 10 })];
  const result = orderChats(chats, []);
  assert.equal(result.pinned.length, 0);
  assert.deepEqual(
    result.rest.map((c) => c.id),
    ["b", "a"],
  );
});
