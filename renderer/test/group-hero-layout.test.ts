import { test } from "node:test";
import assert from "node:assert/strict";
import { groupHeroLayout } from "../src/production/group-hero-layout.ts";

// herdr-bot: a group's avatar cluster has four cells -- the user's own bubble plus up to three members.
// With 1-2 members it stays the stacked cluster (bubble on top, members underneath); from 3 members it
// becomes a 2x2 grid (Grok reference): 3 members fill the grid exactly, 4+ show two members and a
// text "+N" for the rest in the last cell.
test("groupHeroLayout: 0-2 members stack, 3 fill the grid, 4+ show two plus an overflow count", () => {
  assert.deepEqual(groupHeroLayout(0), { layout: "stack", visibleCount: 0, overflow: 0 });
  assert.deepEqual(groupHeroLayout(1), { layout: "stack", visibleCount: 1, overflow: 0 });
  assert.deepEqual(groupHeroLayout(2), { layout: "stack", visibleCount: 2, overflow: 0 });
  assert.deepEqual(groupHeroLayout(3), { layout: "grid", visibleCount: 3, overflow: 0 });
  assert.deepEqual(groupHeroLayout(4), { layout: "grid", visibleCount: 2, overflow: 2 });
  assert.deepEqual(groupHeroLayout(5), { layout: "grid", visibleCount: 2, overflow: 3 });
  assert.deepEqual(groupHeroLayout(12), { layout: "grid", visibleCount: 2, overflow: 10 });
});
