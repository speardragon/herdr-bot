import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRecentChats, projectSidebarOrder, partitionSidebarAgents, pinnedDropPosition, pinnedTileColumns } from "../src/production/sidebar-model.ts";

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

// herdr-bot: the sidebar's row-menu "고정" (Pin) floats a chat to the top of the sidebar, in the order
// the user pinned (or drag-reordered) them, with the rest of the roster in recency order underneath.
// projectSidebarOrder is the flat version of that order -- what Cmd+N (focusAgent) must resolve the
// Nth row against so the shortcut lands on the row the user actually sees. Pinned-ness is derived from
// `pinnedAgentIds`, NOT from an `isPinned` field, because focusAgent runs it on the raw roster
// (agentsRef.current) which never carries isPinned.
test("projectSidebarOrder: a pinned-but-stale chat floats above a recently-active unpinned one", () => {
  const staleButPinned: Chat = { id: "bot-pinned", lastMessageAt: 1, createdAt: 1 };
  const recentUnpinned: Chat = { id: "bot-recent", lastMessageAt: 100, createdAt: 1 };
  assert.deepEqual(projectSidebarOrder([recentUnpinned, staleButPinned], ["bot-pinned"]).map((chat) => chat.id), ["bot-pinned", "bot-recent"]);
});

test("projectSidebarOrder: pinned chats follow pinnedAgentIds order, not recency", () => {
  const a: Chat = { id: "bot-a", lastMessageAt: 10, createdAt: 1 };
  const b: Chat = { id: "bot-b", lastMessageAt: 20, createdAt: 2 };
  const c: Chat = { id: "bot-c", lastMessageAt: 30, createdAt: 3 };
  assert.deepEqual(projectSidebarOrder([a, b, c], ["bot-a", "bot-c"]).map((chat) => chat.id), ["bot-a", "bot-c", "bot-b"]);
});

test("projectSidebarOrder: a pinned id with no matching chat (deleted bot) is ignored", () => {
  const a: Chat = { id: "bot-a", lastMessageAt: 10, createdAt: 1 };
  assert.deepEqual(projectSidebarOrder([a], ["gone", "bot-a"]).map((chat) => chat.id), ["bot-a"]);
});

test("projectSidebarOrder: with nothing pinned it is exactly sortRecentChats", () => {
  const a: Chat = { id: "b-tied", lastMessageAt: 5, createdAt: 1 };
  const b: Chat = { id: "a-tied", lastMessageAt: 5, createdAt: 2 };
  const c: Chat = { id: "fresh", lastMessageAt: 0, createdAt: 50 };
  assert.deepEqual(projectSidebarOrder([a, b, c], []).map((chat) => chat.id), sortRecentChats([a, b, c]).map((chat) => chat.id));
});

// This is the exact render trace ConversationSidebar performs (sidebar.tsx: `partitionSidebarAgents(agents, pinnedAgentIds)`,
// then `orderedPinned.map(renderAgent)` followed by `unpinned.map(renderAgent)`) on the list
// ProductionRenderer hands it (`sortRecentChats(visibleAgents)`, where visibleAgents carries
// `isPinned: pinnedAgentIds.includes(id)`). Flattening it must equal projectSidebarOrder on the raw
// roster, or Cmd+N would open a different chat than the Nth visible row.
test("render trace: flattened partitionSidebarAgents(sortRecentChats(withIsPinned), pinnedIds) equals projectSidebarOrder(raw, pinnedIds)", () => {
  const raw: Chat[] = [
    { id: "bot-a", lastMessageAt: 10, createdAt: 1 },
    { id: "bot-b", lastMessageAt: 20, createdAt: 2 },
    { id: "bot-c", lastMessageAt: 30, createdAt: 3 },
    { id: "bot-d", lastMessageAt: 5, createdAt: 4 }
  ];
  const pinnedIds = ["bot-d", "bot-a", "gone"];
  const withIsPinned = raw.map((chat) => ({ ...chat, isPinned: pinnedIds.includes(chat.id) }));
  const { pinned, unpinned } = partitionSidebarAgents(sortRecentChats(withIsPinned), pinnedIds);
  assert.deepEqual([...pinned, ...unpinned].map((chat) => chat.id), projectSidebarOrder(raw, pinnedIds).map((chat) => chat.id));
  assert.deepEqual(pinned.map((chat) => chat.id), ["bot-d", "bot-a"], "pinned group renders in pin order");
});

// herdr-bot: pinned chats render as a 2-column grid of tiles (row-major, so "before" = left/up), while
// a collapsed sidebar keeps them as stacked rows ("before" = top half). Drag-reorder must read the
// pointer against the axis the layout actually flows on.
test("pinnedDropPosition: a tile splits on the pointer's X (left half = before), a row on its Y", () => {
  const bounds = { left: 100, top: 200, width: 120, height: 100 };
  assert.equal(pinnedDropPosition({ isTile: true, clientX: 120, clientY: 290, bounds }), "before", "left half of a tile, even near its bottom");
  assert.equal(pinnedDropPosition({ isTile: true, clientX: 200, clientY: 205, bounds }), "after", "right half of a tile, even near its top");
  assert.equal(pinnedDropPosition({ isTile: false, clientX: 200, clientY: 210, bounds }), "before", "top half of a row, regardless of X");
  assert.equal(pinnedDropPosition({ isTile: false, clientX: 105, clientY: 290, bounds }), "after", "bottom half of a row, regardless of X");
});

// herdr-bot: the pinned-tile grid starts at 2 columns (the sidebar's default 280px expandedWidth)
// and grows to 3, then 4 as the user drags the sidebar wider -- "사이드바를 다 펼칠 때는 한 줄에 4개"
// only kicks in once there is actually room (near SIDEBAR_LAYOUT_BOUNDS.maxExpandedWidth, 400). The
// tile avatar itself is a constant 72px at every column count (AgentSidebarItem hardcodes "xl") --
// this only ever changes how many fit in a row.
test("pinnedTileColumns: 2 at the default width, 3 once widened, 4 near the max", () => {
  assert.equal(pinnedTileColumns(240), 2, "minExpandedWidth");
  assert.equal(pinnedTileColumns(280), 2, "default expandedWidth");
  assert.equal(pinnedTileColumns(319), 2);
  assert.equal(pinnedTileColumns(320), 3);
  assert.equal(pinnedTileColumns(379), 3);
  assert.equal(pinnedTileColumns(380), 4);
  assert.equal(pinnedTileColumns(400), 4, "maxExpandedWidth");
});