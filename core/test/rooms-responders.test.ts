import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveResponders, stretchSinceLastHuman, wasMentionedSince } from "../src/rooms/responders.ts";
import { orderSpeakers } from "../src/rooms/ordering.ts";
import type { RoomMember, RoomMessage } from "../src/rooms/types.ts";

const atlas: RoomMember = { id: "atlas", name: "Atlas", description: "" };
const forge: RoomMember = { id: "forge", name: "Forge", description: "patches broken code" };
const lens: RoomMember = { id: "lens", name: "Lens", title: "리뷰 담당", description: "checks wording and formatting" };
const members = [atlas, forge, lens];

const haneul: RoomMember = { id: "haneul", name: "하늘", description: "" };
const baram: RoomMember = { id: "baram", name: "바람", description: "" };
const koreanMembers = [haneul, baram];

function user(content: string): RoomMessage {
  return { speaker: { kind: "user", name: "Mina" }, content };
}
function said(member: RoomMember, content: string): RoomMessage {
  return { speaker: { kind: "member", id: member.id, name: member.name }, content };
}

test("resolving responders: no mention at all -> everyone", () => {
  assert.deepEqual(resolveResponders([user("morning team, how's it going")], members), ["atlas", "forge", "lens"]);
});

test("resolving responders: only the stretch from the latest user message onward is examined", () => {
  const history = [user("@lens can you look at this earlier draft"), said(lens, "sure thing"), user("@forge your turn now")];
  assert.deepEqual(resolveResponders(history, members), ["forge"]);
});

test("resolving responders: a mention in a bot reply within the stretch is also in scope", () => {
  const history = [user("@forge your turn now"), said(forge, "@atlas please verify this")];
  assert.deepEqual(resolveResponders(history, members), ["atlas", "forge"]);
});

test("resolving responders: @everyone widens to everyone", () => {
  assert.deepEqual(resolveResponders([user("@everyone let's get started")], members), ["atlas", "forge", "lens"]);
});

test("resolving responders: a soft mention narrows responders to one member", () => {
  assert.deepEqual(resolveResponders([user("하늘이 봐줄래?")], koreanMembers), ["haneul"]);
});

test("resolving responders: a literal mention in the same message suppresses the soft path entirely", () => {
  assert.deepEqual(resolveResponders([user("@바람 하늘이 알려줬어")], koreanMembers), ["baram"]);
});

test("resolving responders: a bot-authored soft-looking name does not trigger, falls back to everyone", () => {
  const history = [user("그래"), said(haneul, "하늘이 그렇게 생각해요")];
  assert.deepEqual(resolveResponders(history, koreanMembers), ["haneul", "baram"]);
});

test("re-eligibility: literal mention / everyone detection after a given transcript point", () => {
  const history = [user("start"), said(atlas, "handling it"), said(forge, "@atlas can you confirm that's right")];
  assert.equal(wasMentionedSince(history, 2, "atlas", members), true);
  assert.equal(wasMentionedSince(history, 3, "atlas", members), false);
});

test("re-eligibility: a soft mention after the point does not count (literal/everyone only)", () => {
  const history = [user("start"), said(haneul, "ok"), user("바람 좀 불러줘")];
  assert.equal(wasMentionedSince(history, 2, "baram", koreanMembers), false);
});

test("speaker ordering: mention-first, remaining tied candidates fall back to join order", () => {
  const stretch = [user("@forge can you take this one")];
  assert.deepEqual(orderSpeakers(["atlas", "forge", "lens"], stretch, new Map(members.map((m) => [m.id, m]))), ["forge", "atlas", "lens"]);
});

test("speaker ordering: keyword/role fit breaks ties by exact token equality only (no plural folding)", () => {
  const scoredAtlas: RoomMember = { ...atlas, description: "triages pull requests and watches coding style" };
  const byId = new Map([scoredAtlas, forge, lens].map((m) => [m.id, m]));
  const stretch = [user("could someone look at this pull request for style issues")];
  assert.deepEqual(orderSpeakers(["atlas", "forge", "lens"], stretch, byId), ["atlas", "forge", "lens"]);
});

test("speaker ordering: pure join-order fallback when nothing overlaps", () => {
  const stretch = [user("good morning everyone, nice weather today")];
  assert.deepEqual(orderSpeakers(["atlas", "forge", "lens"], stretch, new Map(members.map((m) => [m.id, m]))), ["atlas", "forge", "lens"]);
});

test("stretchSinceLastHuman: with no human message ever, the whole transcript is the stretch", () => {
  const history = [said(atlas, "a"), said(forge, "b")];
  assert.deepEqual(stretchSinceLastHuman(history), history);
});
