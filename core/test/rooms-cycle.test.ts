import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomCycleRunner } from "../src/rooms/cycle.ts";
import type { MemberTurnResult, RoomCycleCapabilities, RoomMember, RoomMessage } from "../src/rooms/types.ts";

const atlas: RoomMember = { id: "atlas", name: "Atlas", description: "" };
const forge: RoomMember = { id: "forge", name: "Forge", description: "" };
const lens: RoomMember = { id: "lens", name: "Lens", description: "" };

interface Call {
  readonly round: number;
  readonly memberId: string;
}

function harness(members: readonly RoomMember[], history: RoomMessage[]) {
  const calls: Call[] = [];
  return {
    calls,
    history,
    makeCapabilities(overrides: Partial<RoomCycleCapabilities> = {}): RoomCycleCapabilities {
      return {
        resolveMembers: async () => [...members],
        readHistory: () => [...history],
        isCurrent: () => true,
        runMemberTurn: async ({ member, round }) => {
          calls.push({ round, memberId: member.id });
          return { outcome: "settled", spoken: [] };
        },
        ...overrides,
      };
    },
  };
}

function user(content: string): RoomMessage {
  return { speaker: { kind: "user", name: "Mina" }, content };
}
function said(member: RoomMember, content: string): RoomMessage {
  return { speaker: { kind: "member", id: member.id, name: member.name }, content };
}

test("re-eligibility / early cycle end: both settle, nothing new mentions either -> cycle ends after round 0", async () => {
  const h = harness([atlas, forge], [user("let's kick this off")]);
  const caps = h.makeCapabilities({
    runMemberTurn: async ({ member, round }) => {
      h.calls.push({ round, memberId: member.id });
      h.history.push(said(member, "handling it"));
      return { outcome: "settled", spoken: ["handling it"] };
    },
  });
  await new RoomCycleRunner(caps).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(h.calls, [{ round: 0, memberId: "atlas" }, { round: 0, memberId: "forge" }]);
});

test("re-eligibility: a round-0 mention of a settled member re-invokes it in round 1, then stops", async () => {
  const h = harness([atlas, forge], [user("let's kick this off")]);
  const caps = h.makeCapabilities({
    runMemberTurn: async ({ member, round }) => {
      h.calls.push({ round, memberId: member.id });
      if (member.id === "forge" && round === 0) {
        h.history.push(said(forge, "@atlas can you confirm that's right"));
        return { outcome: "settled", spoken: ["@atlas can you confirm that's right"] };
      }
      h.history.push(said(member, "ok"));
      return { outcome: "settled", spoken: ["ok"] };
    },
  });
  await new RoomCycleRunner(caps).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(h.calls, [{ round: 0, memberId: "atlas" }, { round: 0, memberId: "forge" }, { round: 1, memberId: "atlas" }]);
});

test("early cycle end: the only in-scope member settles with nothing to say -> cycle ends immediately, round 1 never recomputes responders", async () => {
  const h = harness([atlas, forge], [user("@forge, you're the one I need for this")]);
  const caps = h.makeCapabilities({
    runMemberTurn: async ({ member, round }) => {
      h.calls.push({ round, memberId: member.id });
      return { outcome: "settled", spoken: [] };
    },
  });
  await new RoomCycleRunner(caps).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(h.calls, [{ round: 0, memberId: "forge" }]);
});

test("total message-cap enforcement: stops mid-round the instant the budget is reached, never overshoots", async () => {
  const h = harness([atlas, forge], [user("kick off")]);
  const caps = h.makeCapabilities({
    runMemberTurn: async ({ member, round }) => {
      const other = member.id === "atlas" ? forge : atlas;
      h.calls.push({ round, memberId: member.id });
      const spoken = [`@${other.name} msg 1`, `@${other.name} msg 2`];
      for (const text of spoken) h.history.push(said(member, text));
      return { outcome: "settled", spoken };
    },
  });
  await new RoomCycleRunner(caps, { maxRounds: 100, maxSpokenMessages: 10 }).run({ memberIds: ["atlas", "forge"] });
  const totalSpoken = h.history.filter((m) => m.speaker.kind === "member").length;
  assert.equal(totalSpoken, 10);
  assert.equal(h.calls.length, 5);
});

test("busy-skip applies once a round has more than one candidate, regardless of position in the order", async () => {
  const h1 = harness([atlas, forge], [user("@atlas and @forge go")]);
  const caps1 = h1.makeCapabilities({
    peekAvailability: (memberId) => (memberId === "atlas" ? "busy" : "available"),
  });
  const results1: { memberId: string; outcome: string }[] = [];
  await new RoomCycleRunner({ ...caps1, onMemberTurnEnded: (member, result) => results1.push({ memberId: member.id, outcome: result.outcome }) }).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(results1, [{ memberId: "atlas", outcome: "busy" }, { memberId: "forge", outcome: "settled" }]);
  assert.deepEqual(h1.calls, [{ round: 0, memberId: "forge" }]); // atlas's turn is never actually started

  const h2 = harness([atlas, forge], [user("@forge and @atlas go")]);
  const caps2 = h2.makeCapabilities({
    peekAvailability: (memberId) => (memberId === "atlas" ? "busy" : "available"),
  });
  const results2: { memberId: string; outcome: string }[] = [];
  await new RoomCycleRunner({ ...caps2, onMemberTurnEnded: (member, result) => results2.push({ memberId: member.id, outcome: result.outcome }) }).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(results2, [{ memberId: "forge", outcome: "settled" }, { memberId: "atlas", outcome: "busy" }]); // atlas skipped last, even though nothing runs after it
});

test("busy-skip never applies to a single-candidate round, even if the cheap check reports busy", async () => {
  const h = harness([atlas, forge], [user("@atlas please")]);
  const caps = h.makeCapabilities({ peekAvailability: () => "busy" });
  const results: MemberTurnResult[] = [];
  await new RoomCycleRunner({ ...caps, onMemberTurnEnded: (_m, result) => results.push(result), runMemberTurn: async ({ member, round }) => { h.calls.push({ round, memberId: member.id }); return { outcome: "settled", spoken: ["ok"] }; } }).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(h.calls, [{ round: 0, memberId: "atlas" }]);
  assert.deepEqual(results, [{ outcome: "settled", spoken: ["ok"] }]);
});

test("outcomes: busy + blocked both carry zero messages -> the round itself ends the cycle, neither is retried", async () => {
  const h = harness([atlas, forge], [user("kick off")]);
  const caps = h.makeCapabilities({
    runMemberTurn: async ({ member, round }) => {
      h.calls.push({ round, memberId: member.id });
      return member.id === "atlas" ? { outcome: "busy", spoken: [] } : { outcome: "blocked", spoken: [] };
    },
  });
  await new RoomCycleRunner(caps).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(h.calls, [{ round: 0, memberId: "atlas" }, { round: 0, memberId: "forge" }]);
});

test("outcomes: a blocked member that already spoke once keeps that message but is re-prompted next round", async () => {
  const h = harness([atlas, forge], [user("kick off")]);
  let atlasCalls = 0;
  const caps = h.makeCapabilities({
    runMemberTurn: async ({ member, round }) => {
      h.calls.push({ round, memberId: member.id });
      if (member.id === "atlas") {
        atlasCalls += 1;
        if (atlasCalls === 1) { h.history.push(said(atlas, "partial answer")); return { outcome: "blocked", spoken: ["partial answer"] }; }
        h.history.push(said(atlas, "finishing up"));
        return { outcome: "settled", spoken: ["finishing up"] };
      }
      h.history.push(said(forge, "here's my update"));
      return { outcome: "settled", spoken: ["here's my update"] };
    },
  });
  await new RoomCycleRunner(caps).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(h.calls, [{ round: 0, memberId: "atlas" }, { round: 0, memberId: "forge" }, { round: 1, memberId: "atlas" }]);
  const atlasSpokenTexts = h.history.filter((m) => m.speaker.kind === "member" && m.speaker.id === "atlas").map((m) => m.content);
  assert.deepEqual(atlasSpokenTexts, ["partial answer", "finishing up"]);
});

test("cancellation / epochs: a turn already running finishes normally, but the next boundary (next round) stops", async () => {
  const h = harness([atlas, forge], [user("kick off")]);
  let current = true;
  const caps = h.makeCapabilities({
    isCurrent: () => current,
    runMemberTurn: async ({ member, round }) => {
      h.calls.push({ round, memberId: member.id });
      if (member.id === "forge" && round === 1) current = false; // epoch bumped while this turn is "running"
      return { outcome: "stalled", spoken: ["update"] };
    },
  });
  await new RoomCycleRunner(caps, { maxRounds: 3 }).run({ memberIds: ["atlas", "forge"] });
  assert.deepEqual(h.calls, [
    { round: 0, memberId: "atlas" }, { round: 0, memberId: "forge" },
    { round: 1, memberId: "atlas" }, { round: 1, memberId: "forge" },
  ]);
  // round 2 never starts: the boundary check right after forge's round-1 turn finds the epoch stale.
});

test("cancellation / epochs: the next boundary can also be the next member within the same round", async () => {
  const h = harness([atlas, forge, lens], [user("kick off")]);
  let current = true;
  const caps = h.makeCapabilities({
    isCurrent: () => current,
    runMemberTurn: async ({ member, round }) => {
      h.calls.push({ round, memberId: member.id });
      if (member.id === "forge") current = false;
      return { outcome: "stalled", spoken: ["update"] };
    },
  });
  await new RoomCycleRunner(caps).run({ memberIds: ["atlas", "forge", "lens"] });
  assert.deepEqual(h.calls, [{ round: 0, memberId: "atlas" }, { round: 0, memberId: "forge" }]); // lens never starts
});
