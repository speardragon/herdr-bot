import { test } from "node:test";
import assert from "node:assert/strict";
import { literalHandles, softHandles } from "../src/rooms/handles.ts";
import { findLiteralMentions, isEveryoneMention } from "../src/rooms/literal-mentions.ts";
import { findSoftMention } from "../src/rooms/soft-mentions.ts";
import { isPassLike } from "../src/rooms/pass.ts";
import type { RoomMember } from "../src/rooms/types.ts";

const atlas: RoomMember = { id: "atlas", name: "Atlas", description: "" };
const forge: RoomMember = { id: "forge", name: "Forge", description: "patches broken code" };
const lens: RoomMember = { id: "lens", name: "Lens", title: "리뷰 담당", description: "checks wording and formatting" };
const novaKeeper: RoomMember = { id: "nova-keeper-id", name: "Nova Keeper", description: "" };
const haneul: RoomMember = { id: "haneul", name: "하늘", description: "" };
const baram: RoomMember = { id: "baram", name: "바람", description: "" };

test("mention handles: a single-word name dedupes to one handle", () => {
  assert.deepEqual(new Set(literalHandles(lens)), new Set(["lens"]));
});

test("mention handles: a two-word name produces full/squashed/first-word/id handles", () => {
  assert.deepEqual(new Set(literalHandles(novaKeeper)), new Set(["nova keeper", "novakeeper", "nova", "nova-keeper-id"]));
});

test("mention handles: a blank name with no id produces no handles", () => {
  assert.deepEqual(literalHandles({ id: undefined as unknown as string, name: "   " }), []);
});

test("mention handles: a blank name still falls back to the id handle", () => {
  assert.deepEqual(literalHandles({ id: "x7", name: "   " }), ["x7"]);
});

test("literal @ mentions: matches handles with word boundaries, rejecting a longer word that merely starts with the handle", () => {
  const { mentionedIds } = findLiteralMentions("hey @forge and @lens, not @forgeman", [atlas, forge, lens]);
  assert.deepEqual([...mentionedIds].sort(), ["forge", "lens"]);
});

test("literal @ mentions: @all sets the everyone flag with no individual member ids", () => {
  assert.equal(isEveryoneMention("@all please look"), true);
  const { mentionedIds } = findLiteralMentions("@all please look", [atlas, forge, lens]);
  assert.equal(mentionedIds.size, 0);
});

test("literal @ mentions: matching is case-insensitive", () => {
  const { mentionedIds } = findLiteralMentions("@Forge?", [forge]);
  assert.deepEqual([...mentionedIds], ["forge"]);
});

test("literal @ mentions: a non-ASCII suffix glued to the handle still reads as a clean boundary", () => {
  // Decision #1 (kept as-is): the ASCII-only boundary check treats any non-ASCII text, including an
  // unrecognized Korean suffix, as a boundary -- so this is accepted as a mention of "forge".
  const { mentionedIds } = findLiteralMentions("@forge님 감사합니다", [forge]);
  assert.deepEqual([...mentionedIds], ["forge"]);
});

test("soft mentions: a Korean name plus a known particle resolves to that member", () => {
  assert.equal(findSoftMention("하늘에게 맡겨볼까요", [haneul, baram]), "haneul");
  assert.equal(findSoftMention("바람한테 물어보자", [haneul, baram]), "baram");
});

test("soft mentions: two different members named bare in one message is ambiguous -> null", () => {
  assert.equal(findSoftMention("하늘이랑 바람 둘 다 좋아", [haneul, baram]), null);
});

test("soft mentions: no member name present -> null", () => {
  assert.equal(findSoftMention("오늘 날씨가 참 좋네요", [haneul, baram]), null);
});

test("soft mentions: none of the room's handles appear at all -> null", () => {
  assert.equal(findSoftMention("just a thought here", [atlas, forge, lens]), null);
});

test("soft mentions: the bare first word of a multi-word name is not a soft handle", () => {
  assert.equal(findSoftMention("please ask nova about this", [novaKeeper]), null);
});

test("pass-content recognition", () => {
  assert.equal(isPassLike(""), true);
  assert.equal(isPassLike("   "), true);
  assert.equal(isPassLike("pass"), true);
  assert.equal(isPassLike("(pass)"), true);
  assert.equal(isPassLike("(PASS)."), true);
  assert.equal(isPassLike("Pass."), true);
  assert.equal(isPassLike("pass this along to the next person"), false);
});

test("soft handle derivation enforces minimum lengths", () => {
  // name-handle must be >= 2 chars, id-handle >= 3 chars (constants.ts)
  assert.deepEqual(softHandles({ id: "x7", name: "a" }), []);
  assert.deepEqual(softHandles({ id: "ab", name: "" }), []);
});
