import { test } from "node:test";
import assert from "node:assert/strict";
import { newSince, truncateTail } from "../src/rooms/history-view.ts";
import { formatRoomHistory, formatRoomLine } from "../src/rooms/format.ts";
import type { RoomMessage } from "../src/rooms/types.ts";

test("history formatting: oldest first, human/member lines attributed, self flagged", () => {
  const history: RoomMessage[] = [
    { speaker: { kind: "user", name: "Mina" }, content: "let's kick this off" },
    { speaker: { kind: "member", id: "atlas", name: "Atlas" }, content: "handling it now" },
    { speaker: { kind: "member", id: "forge", name: "Forge" }, content: "same here" },
  ];
  const rendered = formatRoomHistory(history, "atlas");
  assert.equal(rendered, "Mina (user): let's kick this off\nAtlas (bot id: atlas) (you): handling it now\nForge (bot id: forge): same here");
});

test("history formatting: a tail window of 1 keeps only the most recent entry", () => {
  const history: RoomMessage[] = [
    { speaker: { kind: "user", name: "Mina" }, content: "let's kick this off" },
    { speaker: { kind: "member", id: "atlas", name: "Atlas" }, content: "handling it now" },
    { speaker: { kind: "member", id: "forge", name: "Forge" }, content: "same here" },
  ];
  assert.deepEqual(truncateTail(history, 1), [history[2]]);
});

test("history formatting: a user line with no known name falls back to a generic label", () => {
  assert.equal(formatRoomLine({ speaker: { kind: "user" }, content: "hi" }, "atlas"), "User (user): hi");
});

test("new-since view: everything after the member's own last line", () => {
  const history: RoomMessage[] = [
    { speaker: { kind: "user" }, content: "a" },
    { speaker: { kind: "member", id: "atlas", name: "Atlas" }, content: "b" },
    { speaker: { kind: "user" }, content: "c" },
    { speaker: { kind: "member", id: "forge", name: "Forge" }, content: "d" },
  ];
  assert.deepEqual(newSince(history, "atlas").map((m) => m.content), ["c", "d"]);
});

test("new-since view: a member that has never spoken sees the full transcript", () => {
  const history: RoomMessage[] = [
    { speaker: { kind: "user" }, content: "a" },
    { speaker: { kind: "member", id: "atlas", name: "Atlas" }, content: "b" },
    { speaker: { kind: "user" }, content: "c" },
    { speaker: { kind: "member", id: "forge", name: "Forge" }, content: "d" },
  ];
  assert.deepEqual(newSince(history, "lens").map((m) => m.content), ["a", "b", "c", "d"]);
});
