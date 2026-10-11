import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer } from "../src/data/store/reducer.ts";
import { createInitialState } from "../src/data/store/types.ts";
import type { ChatSummary } from "../src/data/types.ts";

function chat(id: string, patch: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id,
    kind: "bot",
    name: id,
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

test("chats/replaced sets the whole list", () => {
  const state = reducer(createInitialState(), { type: "chats/replaced", chats: [chat("a")] });
  assert.equal(state.chats.length, 1);
});

test("chats/changed patches an existing chat without touching others", () => {
  const initial = reducer(createInitialState(), { type: "chats/replaced", chats: [chat("a"), chat("b")] });
  const next = reducer(initial, { type: "chats/changed", chat: chat("a", { name: "Atlas" }) });
  assert.equal(next.chats.find((c) => c.id === "a")!.name, "Atlas");
  assert.equal(next.chats.find((c) => c.id === "b"), initial.chats.find((c) => c.id === "b"));
});

test("chats/changed appends an unknown chat id defensively", () => {
  const initial = reducer(createInitialState(), { type: "chats/replaced", chats: [chat("a")] });
  const next = reducer(initial, { type: "chats/changed", chat: chat("new") });
  assert.equal(next.chats.length, 2);
});

test("chat/activated is a no-op when the id is already active (reference stable)", () => {
  const initial = reducer(createInitialState(), { type: "chat/activated", chatId: "a" });
  const next = reducer(initial, { type: "chat/activated", chatId: "a" });
  assert.equal(next, initial);
});

test("transcript/pageLoaded marks loaded and stores nextBeforeSeq", () => {
  const state = reducer(createInitialState(), {
    type: "transcript/pageLoaded",
    chatId: "a",
    direction: "initial",
    page: { entries: [{ id: "e1", kind: "message", seq: 1, timestampMs: 0 }], nextBeforeSeq: undefined },
  });
  assert.equal(state.transcripts.a!.loaded, true);
  assert.equal(state.transcripts.a!.entries.length, 1);
});

test("transcript/entryAppended accumulates even without a prior pageLoaded", () => {
  const state = reducer(createInitialState(), {
    type: "transcript/entryAppended",
    chatId: "a",
    entry: { id: "e1", kind: "message", seq: 1, timestampMs: 0 },
  });
  assert.equal(state.transcripts.a!.entries.length, 1);
  assert.equal(state.transcripts.a!.loaded, false);
});

test("resync/requested bumps the token so a provider effect keyed on it re-runs", () => {
  const state = reducer(createInitialState(), { type: "resync/requested" });
  assert.equal(state.resyncToken, 1);
});
