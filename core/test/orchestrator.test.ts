import { test } from "node:test";
import assert from "node:assert/strict";
import { GroupChatOrchestrator, type MemberTurnResult } from "../src/group/orchestrator.ts";
import type { GroupMember, GroupMessage } from "../src/group/group-chat.ts";

const members: GroupMember[] = [
  { id: "a", name: "A", description: "" },
  { id: "b", name: "B", description: "" },
];

interface Script { readonly [memberId: string]: readonly MemberTurnResult[] }

function harness(script: Script, initial: GroupMessage[] = [{ speaker: { kind: "user", name: "ray" }, content: "go" }]) {
  const history: GroupMessage[] = [...initial];
  const turns: { member: string; round: number; newMessages: number }[] = [];
  const counters = new Map<string, number>();
  let current = true;
  const orchestrator = new GroupChatOrchestrator({
    resolveMembers: async (ids) => members.filter((member) => ids.includes(member.id)),
    readHistory: () => history,
    isCurrent: () => current,
    runMemberTurn: async ({ member, round, newMessages }) => {
      turns.push({ member: member.id, round, newMessages: newMessages.length });
      const index = counters.get(member.id) ?? 0;
      counters.set(member.id, index + 1);
      const result = script[member.id]?.[index] ?? { outcome: "settled", spoken: [] };
      for (const content of result.spoken) history.push({ speaker: { kind: "member", id: member.id, name: member.name }, content });
      return result;
    },
  });
  return { orchestrator, turns, history, cancel: () => { current = false; } };
}

test("everyone speaks in round 0; a silent round ends the run", async () => {
  const h = harness({ a: [{ outcome: "settled", spoken: ["hi"] }], b: [{ outcome: "settled", spoken: ["hey"] }] });
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  assert.deepEqual(h.turns.map((t) => `${t.member}:${t.round}`), ["a:0", "b:0", "b:1", "a:1"]);
});

test("round 1 starts with the second speaker and passes newMessages since last spoke", async () => {
  const h = harness({ a: [{ outcome: "settled", spoken: ["a1"] }, { outcome: "settled", spoken: [] }], b: [{ outcome: "settled", spoken: ["b1"] }, { outcome: "settled", spoken: ["b2"] }] });
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  assert.deepEqual(h.turns, [
    { member: "a", round: 0, newMessages: 1 },
    { member: "b", round: 0, newMessages: 2 },
    { member: "b", round: 1, newMessages: 0 },
    { member: "a", round: 1, newMessages: 2 },
    { member: "a", round: 2, newMessages: 2 },
    { member: "b", round: 2, newMessages: 0 },
  ]);
});

test("mentions restrict responders per round", async () => {
  const h = harness({ b: [{ outcome: "settled", spoken: [] }] }, [{ speaker: { kind: "user", name: "ray" }, content: "@b only you" }]);
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  assert.deepEqual(h.turns.map((t) => t.member), ["b"]);
});

test("run stops when epoch is no longer current", async () => {
  const h = harness({ a: [{ outcome: "settled", spoken: ["x"] }] });
  h.cancel();
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  assert.equal(h.turns.length, 0);
});

test("total message cap ends the run", async () => {
  const chatty: MemberTurnResult[] = Array.from({ length: 6 }, () => ({ outcome: "settled", spoken: ["m", "m"] }));
  const h = harness({ a: chatty, b: chatty });
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  const spoken = h.history.filter((m) => m.speaker.kind === "member").length;
  assert.equal(spoken, 10);
});

test("maxRounds option limits DM-style single member turns", async () => {
  const h = harness({ a: [{ outcome: "settled", spoken: ["one"] }, { outcome: "settled", spoken: ["two"] }] });
  const single = new GroupChatOrchestrator({
    resolveMembers: async () => [members[0]!],
    readHistory: () => h.history,
    isCurrent: () => true,
    runMemberTurn: async (args) => { h.turns.push({ member: args.member.id, round: args.round, newMessages: args.newMessages.length }); return { outcome: "settled", spoken: ["one"] }; },
  }, { maxRounds: 1 });
  await single.run({ memberIds: ["a"] });
  assert.equal(h.turns.length, 1);
});

test("onMemberTurnEnded receives every outcome, and non-settled outcomes count as silence", async () => {
  const ended: string[] = [];
  const orchestrator = new GroupChatOrchestrator({
    resolveMembers: async () => members,
    readHistory: () => [{ speaker: { kind: "user" }, content: "go" }],
    isCurrent: () => true,
    runMemberTurn: async ({ member }) => ({ outcome: member.id === "a" ? "busy" : "blocked", spoken: [] }),
    onMemberTurnEnded: (member, result) => { ended.push(`${member.id}:${result.outcome}`); },
  });
  await orchestrator.run({ memberIds: ["a", "b"] });
  assert.deepEqual(ended, ["a:busy", "b:blocked"]);
});
