import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRecentChats } from "../src/production/sidebar-model.ts";

interface Chat { id: string; lastMessageAt: number; createdAt: number; name?: string; hasUnread?: boolean; runtimeStatus?: string }

test("sortRecentChats orders Bots and groups together by most-recent message", () => {
  const a: Chat = { id: "bot-a", lastMessageAt: 10, createdAt: 1 };
  const b: Chat = { id: "room-b", lastMessageAt: 20, createdAt: 2 };
  const c: Chat = { id: "bot-c", lastMessageAt: 15, createdAt: 3 };
  assert.deepEqual(sortRecentChats([a, b, c]).map((chat) => chat.id), ["room-b", "bot-c", "bot-a"]);
});

test("rename, read-state, and working/done status changes never reorder the list", () => {
  const a: Chat = { id: "bot-a", lastMessageAt: 10, createdAt: 1, name: "A" };
  const b: Chat = { id: "room-b", lastMessageAt: 20, createdAt: 2 };
  const c: Chat = { id: "bot-c", lastMessageAt: 15, createdAt: 3 };
  const order = (chats: readonly Chat[]) => sortRecentChats(chats).map((chat) => chat.id);
  assert.deepEqual(order([a, b, c]), ["room-b", "bot-c", "bot-a"]);
  // Rename A -- lastMessageAt untouched.
  const renamed = { ...a, name: "A renamed" };
  assert.deepEqual(order([renamed, b, c]), ["room-b", "bot-c", "bot-a"]);
  // Mark A read -- lastMessageAt untouched.
  const read = { ...renamed, hasUnread: false };
  assert.deepEqual(order([read, b, c]), ["room-b", "bot-c", "bot-a"]);
  // A starts working, then finishes -- neither transition bumps lastMessageAt.
  const working = { ...read, runtimeStatus: "working" };
  assert.deepEqual(order([working, b, c]), ["room-b", "bot-c", "bot-a"]);
  const done = { ...working, runtimeStatus: "done" };
  assert.deepEqual(order([done, b, c]), ["room-b", "bot-c", "bot-a"]);
});

test("a new incoming message on A moves it to the front", () => {
  const a: Chat = { id: "bot-a", lastMessageAt: 10, createdAt: 1 };
  const b: Chat = { id: "room-b", lastMessageAt: 20, createdAt: 2 };
  const c: Chat = { id: "bot-c", lastMessageAt: 15, createdAt: 3 };
  // The host assigns the new message an activity time strictly greater than the current global max.
  const aReceived = { ...a, lastMessageAt: 21 };
  assert.deepEqual(sortRecentChats([aReceived, b, c]).map((chat) => chat.id), ["bot-a", "room-b", "bot-c"]);
});

test("same-ms lastMessageAt ties break deterministically by id", () => {
  const a: Chat = { id: "b-tied", lastMessageAt: 5, createdAt: 1 };
  const b: Chat = { id: "a-tied", lastMessageAt: 5, createdAt: 2 };
  assert.deepEqual(sortRecentChats([a, b]).map((chat) => chat.id), ["a-tied", "b-tied"]);
});

test("a chat that has never had a message falls back to createdAt", () => {
  const neverMessaged: Chat = { id: "fresh", lastMessageAt: 0, createdAt: 50 };
  const older: Chat = { id: "older", lastMessageAt: 40, createdAt: 1 };
  assert.deepEqual(sortRecentChats([older, neverMessaged]).map((chat) => chat.id), ["fresh", "older"]);
});

test("a temp/draft row is kept outside sortRecentChats and stays pinned above the sorted list", () => {
  const draft = { id: "__draft__" };
  const a: Chat = { id: "bot-a", lastMessageAt: 10, createdAt: 1 };
  const b: Chat = { id: "room-b", lastMessageAt: 20, createdAt: 2 };
  // sortRecentChats only ever receives the real roster; the caller composes [draft, ...sorted].
  const rendered = [draft, ...sortRecentChats([a, b])];
  assert.deepEqual(rendered.map((row) => row.id), ["__draft__", "room-b", "bot-a"]);
});
