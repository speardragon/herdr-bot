import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRecentChats, projectRecentOrderList, partitionSidebarAgents } from "../src/production/sidebar-model.ts";

interface Chat { id: string; lastMessageAt: number; createdAt: number; name?: string; hasUnread?: boolean; runtimeStatus?: string; isPinned?: boolean }

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

// herdr-bot (task 3, fix round 3, plan §2.2 "이 화면에서는 정렬 우선권을 적용하지 않고"): the recent-order
// screen must never let a pinned-but-stale chat float above a recently-active one. sortRecentChats
// alone doesn't guarantee this -- ConversationSidebar/partitionSidebarAgents groups any `isPinned: true`
// item into a separate "Pinned agents" section regardless of array order -- so projectRecentOrderList
// additionally normalizes isPinned to false on every item.
test("projectRecentOrderList: a pinned-but-stale agent does NOT sort above a recently-active unpinned one", () => {
  const staleButPinned: Chat = { id: "bot-pinned", lastMessageAt: 1, createdAt: 1, isPinned: true };
  const recentUnpinned: Chat = { id: "bot-recent", lastMessageAt: 100, createdAt: 1 };
  const result = projectRecentOrderList([staleButPinned, recentUnpinned]);
  assert.deepEqual(result.map((agent) => agent.id), ["bot-recent", "bot-pinned"], "recency order, not pin order");
});

test("projectRecentOrderList: isPinned is normalized to false on every item, without touching any other field", () => {
  const pinned: Chat = { id: "bot-pinned", lastMessageAt: 10, createdAt: 1, isPinned: true, name: "Pinned Bot" };
  const unpinned: Chat = { id: "bot-plain", lastMessageAt: 5, createdAt: 1 };
  const [first, second] = projectRecentOrderList([pinned, unpinned]);
  assert.equal(first.isPinned, false);
  assert.equal(first.name, "Pinned Bot", "only isPinned is overridden -- every other field is untouched");
  assert.equal(second.isPinned, undefined, "an item that was never pinned is returned as-is (same falsy isPinned)");
});

test("projectRecentOrderList: the result is still exactly sortRecentChats's order (same tie-break, same createdAt fallback)", () => {
  const a: Chat = { id: "b-tied", lastMessageAt: 5, createdAt: 1, isPinned: true };
  const b: Chat = { id: "a-tied", lastMessageAt: 5, createdAt: 2 };
  assert.deepEqual(projectRecentOrderList([a, b]).map((chat) => chat.id), sortRecentChats([a, b]).map((chat) => chat.id));
});

// This is the exact render trace ConversationSidebar performs (sidebar.tsx: `partitionSidebarAgents(agents, pinnedAgentIds)`,
// then `orderedPinned.map(renderAgent)` followed by `unpinned.map(renderAgent)`). Feeding it
// projectRecentOrderList's output (with pinnedAgentIds: []) proves, at the shared-function level, that
// orderedPinned is always empty on the recent-order screen and unpinned is the full recency-ordered list.
test("render trace: partitionSidebarAgents(projectRecentOrderList(agents), []) yields an empty pinned group and the full recency list as unpinned", () => {
  const staleButPinned: Chat = { id: "bot-pinned", lastMessageAt: 1, createdAt: 1, isPinned: true };
  const recentUnpinned: Chat = { id: "bot-recent", lastMessageAt: 100, createdAt: 1 };
  const { pinned, unpinned } = partitionSidebarAgents(projectRecentOrderList([staleButPinned, recentUnpinned]), []);
  assert.deepEqual(pinned, [], "no 'Pinned agents' group renders on this screen");
  assert.deepEqual(unpinned.map((agent) => agent.id), ["bot-recent", "bot-pinned"], "the full recency-ordered list renders flat");
});
