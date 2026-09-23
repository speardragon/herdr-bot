import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_MAX_MEMBER_TURNS, GROUP_MAX_MESSAGES_PER_TURN, GROUP_MAX_ROUNDS,
  formatGroupHistory, isPassContent, isSameMemberSet, memberMentionHandles, messagesSinceMemberLastSpoke,
  orderRoundSpeakers, parseGroupMentions, resolveResponders, type GroupMember, type GroupMessage,
} from "../src/group/group-chat.ts";

const members: GroupMember[] = [
  { id: "reviewer", name: "Code Reviewer", description: "" },
  { id: "fixer", name: "Fixer", description: "" },
  { id: "writer", name: "Doc Writer", description: "" },
];
const user = (content: string): GroupMessage => ({ speaker: { kind: "user", name: "ray" }, content });
const said = (id: string, content: string): GroupMessage => ({ speaker: { kind: "member", id, name: id }, content });

test("constants match grok-bot", () => {
  assert.deepEqual([GROUP_MAX_ROUNDS, GROUP_MAX_MEMBER_TURNS, GROUP_MAX_MESSAGES_PER_TURN], [3, 10, 2]);
});

test("orderRoundSpeakers rotates the start by round", () => {
  assert.deepEqual(orderRoundSpeakers(["a", "b", "c"], 0), ["a", "b", "c"]);
  assert.deepEqual(orderRoundSpeakers(["a", "b", "c"], 1), ["b", "c", "a"]);
  assert.deepEqual(orderRoundSpeakers(["a", "b", "c"], 4), ["b", "c", "a"]);
  assert.deepEqual(orderRoundSpeakers([], 2), []);
});

test("isSameMemberSet ignores order", () => {
  assert.equal(isSameMemberSet(["a", "b"], ["b", "a"]), true);
  assert.equal(isSameMemberSet(["a"], ["a", "b"]), false);
});

test("mention handles include lowercase name, squashed name, first word, and the id", () => {
  assert.deepEqual(memberMentionHandles("Code Reviewer", "reviewer").sort(), ["code", "code reviewer", "codereviewer", "reviewer"].sort());
  assert.deepEqual(memberMentionHandles("  "), []);
});

test("parseGroupMentions matches @handles on word boundaries and @everyone", () => {
  assert.deepEqual(parseGroupMentions("hey @reviewer and @fixer, not @fixerman", members), { isEveryone: false, memberIds: ["reviewer", "fixer"] });
  assert.deepEqual(parseGroupMentions("@all please", members), { isEveryone: true, memberIds: [] });
  assert.deepEqual(parseGroupMentions("@CodeReviewer?", members).memberIds, ["reviewer"]);
});

test("resolveResponders picks mentioned members since the last user message, else everyone", () => {
  assert.deepEqual(resolveResponders(members, [user("hello all")]).map((m) => m.id), ["reviewer", "fixer", "writer"]);
  assert.deepEqual(resolveResponders(members, [user("@writer old"), said("writer", "ok"), user("@fixer fix it")]).map((m) => m.id), ["fixer"]);
  assert.deepEqual(resolveResponders(members, [user("@fixer fix it"), said("fixer", "@reviewer check")]).map((m) => m.id), ["reviewer", "fixer"]);
  assert.deepEqual(resolveResponders(members, [user("@everyone")]).length, 3);
});

test("isPassContent accepts pass variants", () => {
  for (const value of ["", "  ", "pass", "(pass)", "(PASS).", "Pass."]) assert.equal(isPassContent(value), true, value);
  assert.equal(isPassContent("pass the salt"), false);
});

test("history formatting marks the viewer and honours the limit", () => {
  const history = [user("go"), said("reviewer", "on it"), said("fixer", "me too")];
  assert.equal(formatGroupHistory(history, "reviewer"), "ray (user): go\nreviewer (bot id: reviewer) (you): on it\nfixer (bot id: fixer): me too");
  assert.equal(formatGroupHistory(history, "reviewer", 1), "fixer (bot id: fixer): me too");
  assert.equal(formatGroupHistory([], "x"), "(no messages yet)");
});

test("messagesSinceMemberLastSpoke slices after the member's last message", () => {
  const history = [user("a"), said("reviewer", "b"), user("c"), said("fixer", "d")];
  assert.deepEqual(messagesSinceMemberLastSpoke(history, "reviewer").map((m) => m.content), ["c", "d"]);
  assert.deepEqual(messagesSinceMemberLastSpoke(history, "writer").map((m) => m.content), ["a", "b", "c", "d"]);
});
