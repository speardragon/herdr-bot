import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prioritizeEveryone,
  projectMentionMembers,
  computeMentionCandidates,
  selectEditorSuggestion,
} from "../src/recovered/features/conversation/workspace/editor-suggestion-provider.ts";

test("everyone stays first after recency ranking", () => {
  assert.deepEqual(prioritizeEveryone([{ id: "a" }, { id: "__everyone__" }, { id: "b" }])
    .map(item => item.id), ["__everyone__", "a", "b"]);
});

test("prioritizeEveryone is a no-op when everyone is absent", () => {
  assert.deepEqual(prioritizeEveryone([{ id: "a" }, { id: "b" }]).map(item => item.id), ["a", "b"]);
});

test("projectMentionMembers carries avatar data, not just the name", () => {
  const [entry] = projectMentionMembers([
    { id: "bot-1", name: "Fixer", avatarDataUrl: "data:image/png;base64,AAA", avatarShape: "cloud", avatarColor: "#123456" },
  ], false);
  assert.equal(entry.icon.type, "agent");
  assert.equal(entry.icon.agentId, "bot-1");
  assert.equal(entry.icon.name, "Fixer");
  assert.equal(entry.icon.dataUrl, "data:image/png;base64,AAA");
  assert.equal(entry.icon.shape, "cloud");
  assert.equal(entry.icon.color, "#123456");
});

test("projectMentionMembers avatar fields default to null when absent", () => {
  const [entry] = projectMentionMembers([{ id: "bot-1", name: "Fixer" }], false);
  assert.equal(entry.icon.dataUrl, null);
  assert.equal(entry.icon.shape, null);
  assert.equal(entry.icon.color, null);
});

test("everyone entry always inserts as plain 'everyone', regardless of its display label", () => {
  const [everyone] = projectMentionMembers([
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ], true);
  assert.equal(everyone.id, "__everyone__");
  assert.equal(everyone.insert.type, "mention");
  assert.equal(everyone.insert.id, "__everyone__");
  assert.equal(everyone.insert.label, "everyone");
  // Search terms 전체/everyone/all must all resolve to the everyone entry.
  assert.ok(everyone.keywords.includes("전체"));
  assert.ok(everyone.keywords.includes("everyone"));
  assert.ok(everyone.keywords.includes("all"));
});

test("everyone appears even for a single-member scope (DM), matching the actual delivery of one bot", () => {
  const [everyone, ...rest] = projectMentionMembers([{ id: "solo", name: "Solo" }], true);
  assert.equal(everyone.id, "__everyone__");
  assert.deepEqual(rest.map((entry) => entry.id), ["solo"]);
});

test("everyone's icon carries the scope's actual member ids, so its row reuses the existing composited group avatar", () => {
  const group = projectMentionMembers([{ id: "m1", name: "M1" }, { id: "m2", name: "M2" }], true);
  assert.deepEqual(group[0]!.icon.memberIds, ["m1", "m2"]);

  const dm = projectMentionMembers([{ id: "solo", name: "Solo" }], true);
  assert.deepEqual(dm[0]!.icon.memberIds, ["solo"]);
});

test("everyone is omitted for an empty roster (0-member guidance case)", () => {
  assert.deepEqual(projectMentionMembers([], true), []);
});

test("duplicate display names with different ids are both kept, distinguished by id", () => {
  const entries = projectMentionMembers([
    { id: "bot-a", name: "Fixer" },
    { id: "bot-b", name: "Fixer" },
  ], false);
  assert.deepEqual(entries.map((entry) => entry.id), ["bot-a", "bot-b"]);
  assert.deepEqual(entries.map((entry) => entry.insert.id), ["bot-a", "bot-b"]);
});

test("computeMentionCandidates: group scope only offers current members plus everyone", () => {
  const roster = [
    { id: "m1", name: "Member One" },
    { id: "m2", name: "Member Two" },
    { id: "outsider", name: "Outsider" },
    { id: "room-1", name: "Room", isGroup: true },
  ];
  const result = computeMentionCandidates({ isGroup: true, id: "room-1", memberIds: ["m1", "m2"] }, roster, "");
  assert.deepEqual(result.map((entry) => entry.id), ["__everyone__", "m1", "m2"]);
});

test("computeMentionCandidates: DM scope is limited to the counterpart bot plus everyone", () => {
  const roster = [
    { id: "bot-1", name: "Bot One" },
    { id: "bot-2", name: "Bot Two" },
  ];
  const result = computeMentionCandidates({ isGroup: false, id: "bot-1", memberIds: [] }, roster, "");
  assert.deepEqual(result.map((entry) => entry.id), ["__everyone__", "bot-1"]);
});

test("computeMentionCandidates excludes non-member and non-group bots", () => {
  const roster = [
    { id: "m1", name: "Member One" },
    { id: "not-a-member", name: "Not A Member" },
    { id: "a-group", name: "A Group", isGroup: true },
  ];
  const result = computeMentionCandidates({ isGroup: true, id: "room-1", memberIds: ["m1"] }, roster, "");
  assert.deepEqual(result.map((entry) => entry.id), ["__everyone__", "m1"]);
});

test("computeMentionCandidates: non-empty search shows matches only, with everyone staying on top when it matches", () => {
  const roster = [
    { id: "m1", name: "Fixer" },
    { id: "m2", name: "Reviewer" },
  ];
  const scope = { isGroup: true, id: "room-1", memberIds: ["m1", "m2"] };
  assert.deepEqual(computeMentionCandidates(scope, roster, "fix").map((entry) => entry.id), ["m1"]);
  assert.deepEqual(computeMentionCandidates(scope, roster, "everyone").map((entry) => entry.id), ["__everyone__"]);
  assert.deepEqual(computeMentionCandidates(scope, roster, "전체").map((entry) => entry.id), ["__everyone__"]);
  assert.deepEqual(computeMentionCandidates(scope, roster, "all").map((entry) => entry.id), ["__everyone__"]);
});

test("computeMentionCandidates: an empty group roster yields no candidates (0-member guidance)", () => {
  const result = computeMentionCandidates({ isGroup: true, id: "room-1", memberIds: [] }, [
    { id: "outsider", name: "Outsider" },
  ], "");
  assert.deepEqual(result, []);
});

test("existing keyboard behaviour (ArrowDown/ArrowUp/Enter/Escape) is unchanged", () => {
  const entries = [
    { id: "__everyone__", category: "assistants" as const, key: "a", label: "everyone", keywords: [], icon: { type: "everyone" as const }, isGroup: false, insert: { type: "mention" as const, id: "__everyone__", label: "everyone" } },
    { id: "m1", category: "assistants" as const, key: "b", label: "Fixer", keywords: [], icon: { type: "agent" as const }, isGroup: false, insert: { type: "mention" as const, id: "m1", label: "Fixer" } },
  ];
  assert.deepEqual(selectEditorSuggestion(entries, 0, "ArrowDown"), { kind: "move", activeIndex: 1 });
  assert.deepEqual(selectEditorSuggestion(entries, 1, "ArrowDown"), { kind: "move", activeIndex: 0 });
  assert.deepEqual(selectEditorSuggestion(entries, 0, "Enter"), { kind: "select", entry: entries[0] });
  assert.deepEqual(selectEditorSuggestion(entries, 0, "Escape"), { kind: "dismiss" });
  assert.deepEqual(selectEditorSuggestion([], 0, "Escape"), { kind: "dismiss" });
});
