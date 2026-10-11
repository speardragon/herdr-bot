import { test } from "node:test";
import assert from "node:assert/strict";
import { filterChats, filterChatsByKind, matchesChatQuery } from "../src/features/palette/filter-chats.ts";
import type { ChatSummary } from "../src/data/types.ts";

function chat(id: string, kind: ChatSummary["kind"], name: string, description = ""): ChatSummary {
  return {
    id,
    kind,
    name,
    description,
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
    lastMessageAt: 0,
    lastActivityAt: 0,
    awaitingUserResponse: null,
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: false,
    isGroup: kind === "room",
    memberIds: [],
    bot: null,
  };
}

test("matchesChatQuery is case-insensitive over name and description", () => {
  const forge = chat("forge", "bot", "Forge", "Writes and fixes code across the stack.");
  assert.equal(matchesChatQuery(forge, "FORGE"), true);
  assert.equal(matchesChatQuery(forge, "fixes code"), true);
  assert.equal(matchesChatQuery(forge, "nope"), false);
});

test("matchesChatQuery with an empty/whitespace query matches everything", () => {
  const forge = chat("forge", "bot", "Forge");
  assert.equal(matchesChatQuery(forge, ""), true);
  assert.equal(matchesChatQuery(forge, "   "), true);
});

test("filterChats filters the whole list", () => {
  const chats = [chat("forge", "bot", "Forge"), chat("scout", "bot", "Scout")];
  assert.deepEqual(filterChats(chats, "sco").map((c) => c.id), ["scout"]);
});

test("filterChatsByKind filters by query, then by kind", () => {
  const chats = [chat("forge", "bot", "Forge"), chat("room-1", "room", "Forge's room")];
  assert.deepEqual(filterChatsByKind(chats, "forge", "bot").map((c) => c.id), ["forge"]);
  assert.deepEqual(filterChatsByKind(chats, "forge", "room").map((c) => c.id), ["room-1"]);
});
