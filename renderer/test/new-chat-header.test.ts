import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeOption,
  addDraftMember,
  buildOptionList,
  canCreateGroup,
  createNewChatDraft,
  defaultGroupName,
  moveActiveIndex,
  pruneDraftMembers,
  removeDraftMember,
  selectedMembers,
  shouldSelectOnEnter,
  startDraft,
  type NewChatCandidateBot,
  type NewChatDraft,
} from "../src/production/new-chat-model.ts";

// herdr-bot: NewChatHeader.tsx stays a thin presentational shell -- there is no DOM/React test
// harness in this repo (see task-5-brief.md), so the header's actual testable behaviour is
// extracted into the pure functions above and exercised here.

const BOTS: readonly NewChatCandidateBot[] = [
  { id: "reviewer", name: "Reviewer" },
  { id: "fixer", name: "Fixer" },
  { id: "researcher", name: "Researcher" },
  { id: "provisioning-bot", name: "New Bot", onboardingStage: "provisioning" },
  { id: "failed-bot", name: "Broken Bot", onboardingStage: "failed" },
];

test("empty query in choose mode surfaces only the two create actions", () => {
  const draft = createNewChatDraft("r1");
  const options = buildOptionList(draft, BOTS);
  assert.deepEqual(options.map(o => o.kind), ["create-bot", "create-group"]);
});

test("a non-empty query in choose mode surfaces matching bots plus the two create actions", () => {
  const draft: NewChatDraft = { ...createNewChatDraft("r1"), query: "fix" };
  const options = buildOptionList(draft, BOTS);
  assert.deepEqual(options.map(o => o.kind), ["bot", "create-bot", "create-group"]);
  assert.equal(options[0].kind === "bot" ? options[0].bot.id : null, "fixer");
});

test("group mode searches member candidates only, excluding selected members and not-yet-joinable bots", () => {
  const chosen = addDraftMember({ ...createNewChatDraft("r1"), mode: "group" }, "reviewer");
  const options = buildOptionList(chosen, BOTS);
  assert.deepEqual(options.map(o => (o.kind === "bot" ? o.bot.id : o.kind)), ["fixer", "researcher"]);
});

test("selectedMembers preserves draft.memberIds order for chip rendering", () => {
  let draft = createNewChatDraft("r1");
  draft = { ...draft, mode: "group" };
  draft = addDraftMember(draft, "fixer");
  draft = addDraftMember(draft, "reviewer");
  assert.deepEqual(selectedMembers(draft, BOTS).map(b => b.id), ["fixer", "reviewer"]);
});

test("removing a chip drops only that member (regression: x removes one chip)", () => {
  let draft = { ...createNewChatDraft("r1"), mode: "group" as const };
  draft = addDraftMember(draft, "fixer");
  draft = addDraftMember(draft, "reviewer");
  const next = removeDraftMember(draft, "fixer");
  assert.deepEqual(next.memberIds, ["reviewer"]);
});

test("0 or 1 member cannot create a group; 6 is the max, 7th is dropped", () => {
  let draft = { ...createNewChatDraft("r1"), mode: "group" as const };
  assert.equal(canCreateGroup(draft), false);
  draft = addDraftMember(draft, "a");
  assert.equal(canCreateGroup(draft), false);
  for (const id of ["b", "c", "d", "e", "f", "g"]) draft = addDraftMember(draft, id);
  assert.equal(draft.memberIds.length, 6);
  assert.equal(canCreateGroup(draft), true);
});

test("default group name joins selected names in order and truncates at 40 chars with an ellipsis", () => {
  const short = defaultGroupName([{ id: "a", name: "Reviewer" }, { id: "b", name: "Fixer" }]);
  assert.equal(short, "Reviewer, Fixer");
  const longNames = [
    { id: "a", name: "A Very Long Persona Name That Overflows" },
    { id: "b", name: "Another Very Long Persona Name" },
  ];
  const long = defaultGroupName(longNames);
  assert.equal(long.length, 40);
  assert.ok(long.endsWith("…"));
});

test("ArrowUp/Down clamp at the ends of the option list (no wraparound)", () => {
  assert.equal(moveActiveIndex(null, 3, "down"), 0);
  assert.equal(moveActiveIndex(0, 3, "down"), 1);
  assert.equal(moveActiveIndex(2, 3, "down"), 2);
  assert.equal(moveActiveIndex(null, 3, "up"), 2);
  assert.equal(moveActiveIndex(0, 3, "up"), 0);
  assert.equal(moveActiveIndex(1, 0, "down"), null);
});

test("Enter selects the active option; an out-of-range index selects nothing", () => {
  const options = ["a", "b", "c"];
  assert.equal(activeOption(options, 1), "b");
  assert.equal(activeOption(options, null), null);
  assert.equal(activeOption(options, 5), null);
});

test("Enter during IME composition must not select (regression: IME Enter does not create)", () => {
  assert.equal(shouldSelectOnEnter({ isComposing: true }), false);
  assert.equal(shouldSelectOnEnter({ keyCode: 229 }), false);
  assert.equal(shouldSelectOnEnter({}), true);
});

test("+ pressed repeatedly must not create more than one draft (regression: startDraft is a no-op once a draft exists)", () => {
  const first = startDraft(null, "request-1");
  const second = startDraft(first, "request-2");
  const third = startDraft(second, "request-3");
  assert.equal(second, first, "a second '+' press must return the SAME draft, not a new one");
  assert.equal(third, first);
  assert.equal(first.requestId, "request-1");
});

test("a deleted/not-yet-ready member is pruned from the draft before submit, with the surviving chips kept (regression: RPC failure keeps the good chips)", () => {
  let draft: NewChatDraft = { ...createNewChatDraft("r1"), mode: "group" };
  draft = addDraftMember(draft, "reviewer");
  draft = addDraftMember(draft, "gone"); // selected earlier, then deleted -- no longer a candidate at all
  draft = addDraftMember(draft, "stuck"); // selected earlier, now stuck in provisioning
  const candidatesAtSubmit: readonly NewChatCandidateBot[] = [
    { id: "reviewer", name: "Reviewer" },
    { id: "stuck", name: "Stuck Bot", onboardingStage: "provisioning" },
  ];
  const pruned = pruneDraftMembers(draft, candidatesAtSubmit);
  assert.deepEqual(pruned.memberIds, ["reviewer"]);
  assert.equal(canCreateGroup(pruned), false, "one surviving member can no longer start a group");
  // pruning a draft with no stale members returns the same reference (no needless re-render)
  const stable: readonly NewChatCandidateBot[] = [{ id: "reviewer", name: "Reviewer" }];
  const onlyReviewer = { ...createNewChatDraft("r2"), mode: "group" as const, memberIds: ["reviewer"] };
  assert.equal(pruneDraftMembers(onlyReviewer, stable), onlyReviewer);
});
