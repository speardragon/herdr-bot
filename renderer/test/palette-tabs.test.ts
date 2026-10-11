import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleTabs } from "../src/features/palette/tabs.ts";

test("visibleTabs always shows All/Messages/Actions", () => {
  assert.deepEqual(visibleTabs({ bots: 0, groups: 0 }), ["all", "messages", "actions"]);
});

test("visibleTabs adds Bots only when at least one bot chat exists", () => {
  assert.deepEqual(visibleTabs({ bots: 1, groups: 0 }), ["all", "messages", "bots", "actions"]);
});

test("visibleTabs adds Groups only when at least one room exists", () => {
  assert.deepEqual(visibleTabs({ bots: 0, groups: 2 }), ["all", "messages", "groups", "actions"]);
});

test("visibleTabs shows every tab when both kinds exist", () => {
  assert.deepEqual(visibleTabs({ bots: 3, groups: 1 }), ["all", "messages", "bots", "groups", "actions"]);
});
