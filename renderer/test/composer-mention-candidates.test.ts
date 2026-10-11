import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMentionCandidates, filterMentionCandidates, EVERYONE_MENTION_ID } from "../src/features/composer/mention-candidates.ts";

const MEMBERS = [
  { id: "bot-forge", name: "Forge", avatarColor: "blue" },
  { id: "bot-lens", name: "Lens", avatarColor: "violet" },
  { id: "bot-atlas", name: "Atlas", avatarColor: "orange" },
];

test("an empty member list (a bot DM) yields no candidates at all -- not even Everyone", () => {
  assert.deepEqual(buildMentionCandidates([]), []);
});

test("Everyone is first, then members in room-membership order (not alphabetical)", () => {
  const candidates = buildMentionCandidates(MEMBERS);
  assert.deepEqual(
    candidates.map((c) => c.label),
    ["Everyone", "Forge", "Lens", "Atlas"],
  );
  assert.equal(candidates[0]?.id, EVERYONE_MENTION_ID);
  assert.equal(candidates[0]?.everyone, true);
});

test("member candidates carry their avatarColor through for the picker's avatar", () => {
  const candidates = buildMentionCandidates(MEMBERS);
  const forge = candidates.find((c) => c.id === "bot-forge");
  assert.equal(forge?.avatarColor, "blue");
});

test("filter with an empty query returns every candidate, unchanged order", () => {
  const candidates = buildMentionCandidates(MEMBERS);
  assert.deepEqual(filterMentionCandidates(candidates, ""), candidates);
});

test("filter is a case-insensitive substring match on the label", () => {
  const candidates = buildMentionCandidates(MEMBERS);
  const filtered = filterMentionCandidates(candidates, "or");
  assert.deepEqual(
    filtered.map((c) => c.label),
    ["Forge"],
  );
});

test("typing part of the word 'everyone' still matches the Everyone row", () => {
  const candidates = buildMentionCandidates(MEMBERS);
  const filtered = filterMentionCandidates(candidates, "every");
  assert.deepEqual(
    filtered.map((c) => c.label),
    ["Everyone"],
  );
});

test("a query matching nothing returns an empty list", () => {
  const candidates = buildMentionCandidates(MEMBERS);
  assert.deepEqual(filterMentionCandidates(candidates, "zzz"), []);
});
