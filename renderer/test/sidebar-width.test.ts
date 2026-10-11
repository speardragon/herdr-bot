import { test } from "node:test";
import assert from "node:assert/strict";
import { SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN, resolveSidebarDrag, widthForMode } from "../src/shell/sidebar-width.ts";

test("dragging below the snap threshold collapses to the icon rail", () => {
  const result = resolveSidebarDrag(100);
  assert.deepEqual(result, { width: SIDEBAR_RAIL_WIDTH, mode: "rail" });
});

test("dragging above the threshold stays expanded and clamps to [min,max]", () => {
  assert.equal(resolveSidebarDrag(300).mode, "expanded");
  assert.equal(resolveSidebarDrag(1000).width, SIDEBAR_WIDTH_MAX);
  assert.equal(resolveSidebarDrag(161).width, Math.max(161, SIDEBAR_WIDTH_MIN));
});

test("widthForMode returns the rail width regardless of the persisted width", () => {
  assert.equal(widthForMode("rail", 280), SIDEBAR_RAIL_WIDTH);
});

test("widthForMode clamps a persisted expanded width", () => {
  assert.equal(widthForMode("expanded", 10), SIDEBAR_WIDTH_MIN);
  assert.equal(widthForMode("expanded", 9999), SIDEBAR_WIDTH_MAX);
});
