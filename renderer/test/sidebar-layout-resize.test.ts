import { test } from "node:test";
import assert from "node:assert/strict";
import { commitSidebarResize, resizeSidebarLayout, SIDEBAR_COLLAPSE_MARGIN, SIDEBAR_EXPAND_MARGIN } from "../src/production/sidebar-model.ts";

const bounds = { minExpandedWidth: 240, maxExpandedWidth: 400 };

const expanded = { expandedWidth: 280, isCollapsed: false };
const collapsed = { expandedWidth: 280, isCollapsed: true };
const atMinimum = { expandedWidth: bounds.minExpandedWidth, isCollapsed: false };

test("reaching the expanded minimum holds there instead of snapping to the rail", () => {
  assert.deepEqual(resizeSidebarLayout(expanded, bounds.minExpandedWidth - 1, bounds), atMinimum);
});

test("the hold continues while the pointer is still inside the snap margin", () => {
  assert.equal(
    resizeSidebarLayout(atMinimum, bounds.minExpandedWidth - SIDEBAR_COLLAPSE_MARGIN, bounds),
    atMinimum
  );
});

test("the rail snaps once the pointer travels the margin past the minimum", () => {
  assert.deepEqual(
    resizeSidebarLayout(atMinimum, bounds.minExpandedWidth - SIDEBAR_COLLAPSE_MARGIN - 1, bounds),
    { expandedWidth: bounds.minExpandedWidth, isCollapsed: true }
  );
});

test("a jump from a wide sidebar straight past the margin keeps that expanded width", () => {
  assert.deepEqual(resizeSidebarLayout(expanded, 100, bounds), { expandedWidth: 280, isCollapsed: true });
});

test("the minimum expanded width itself stays expanded", () => {
  assert.deepEqual(resizeSidebarLayout(expanded, bounds.minExpandedWidth, bounds), atMinimum);
});

test("dragging inside the expanded range follows the pointer", () => {
  assert.deepEqual(resizeSidebarLayout(expanded, 320.4, bounds), { expandedWidth: 320, isCollapsed: false });
});

test("dragging past the maximum clamps and stays expanded", () => {
  assert.deepEqual(resizeSidebarLayout(expanded, 900, bounds), {
    expandedWidth: bounds.maxExpandedWidth,
    isCollapsed: false
  });
});

test("a collapsed rail stays collapsed until the pointer clears the expand margin past the minimum", () => {
  assert.equal(
    resizeSidebarLayout(collapsed, bounds.minExpandedWidth + SIDEBAR_EXPAND_MARGIN - 1, bounds),
    collapsed
  );
});

test("clearing that margin expands a collapsed rail to the pointer width", () => {
  const openedAt = bounds.minExpandedWidth + SIDEBAR_EXPAND_MARGIN;
  assert.deepEqual(resizeSidebarLayout(collapsed, openedAt, bounds), { expandedWidth: openedAt, isCollapsed: false });
  assert.deepEqual(resizeSidebarLayout(collapsed, 360, bounds), { expandedWidth: 360, isCollapsed: false });
});

test("dragging a collapsed rail while still under the minimum leaves the remembered width alone", () => {
  assert.equal(resizeSidebarLayout(collapsed, 120, bounds), collapsed);
});

test("an unchanged expanded width is the same state", () => {
  assert.equal(resizeSidebarLayout(expanded, 280, bounds), expanded);
});

test("ending a drag on the rail restores the width from before the gesture", () => {
  const origin = { expandedWidth: 280, isCollapsed: false };
  const pending = { expandedWidth: 240, isCollapsed: true };
  assert.deepEqual(commitSidebarResize(origin, pending), { expandedWidth: 280, isCollapsed: true });
});

test("ending a drag still expanded keeps the pointer width", () => {
  const origin = { expandedWidth: 280, isCollapsed: false };
  const pending = { expandedWidth: 320, isCollapsed: false };
  assert.equal(commitSidebarResize(origin, pending), pending);
});
