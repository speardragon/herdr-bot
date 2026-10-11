import assert from "node:assert/strict";
import test from "node:test";
import { roomCells } from "../src/primitives/room-cells.ts";
import type { StackMember } from "../src/primitives/room-cells.ts";

const member = (name: string): StackMember => ({ name, color: "blue" });
const kinds = (cells: ReturnType<typeof roomCells>) => cells.map((cell) => (cell.kind === "member" ? cell.member.name : cell.kind === "overflow" ? `+${cell.count}` : "me"));

test("Me comes first, then every member while four cells are enough", () => {
  assert.deepEqual(kinds(roomCells([member("a"), member("b"), member("c")], "Me")), ["me", "a", "b", "c"]);
  assert.deepEqual(kinds(roomCells([member("a")], "Me")), ["me", "a"]);
});

test("the last cell becomes +N when the members don't fit", () => {
  assert.deepEqual(kinds(roomCells([member("a"), member("b"), member("c"), member("d")], "Me")), ["me", "a", "b", "+2"]);
});

test("without Me, four members fit and a fifth turns the last cell into a count", () => {
  assert.deepEqual(kinds(roomCells([member("a"), member("b"), member("c")], undefined)), ["a", "b", "c"]);
  assert.deepEqual(kinds(roomCells(["a", "b", "c", "d", "e"].map(member), undefined)), ["a", "b", "c", "+2"]);
});
