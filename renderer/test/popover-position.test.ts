import { test } from "node:test";
import assert from "node:assert/strict";
import { placeAtPoint, placeNear, resolveVerticalPlacement } from "../src/primitives/popover-position.ts";

const viewport = { width: 1000, height: 800 };

test("placeNear bottom-start sits just below/left of the anchor", () => {
  const anchor = { top: 100, left: 50, width: 200, height: 30 };
  const result = placeNear(anchor, { width: 180, height: 120 }, "bottom-start", viewport);
  assert.equal(result.top, 134);
  assert.equal(result.left, 50);
});

test("placeNear bottom-end aligns the panel's right edge to the anchor's right edge", () => {
  const anchor = { top: 100, left: 50, width: 200, height: 30 };
  const result = placeNear(anchor, { width: 180, height: 120 }, "bottom-end", viewport);
  assert.equal(result.left, 50 + 200 - 180);
});

test("placeNear clamps inside the viewport near an edge", () => {
  const anchor = { top: 790, left: 990, width: 10, height: 10 };
  const result = placeNear(anchor, { width: 300, height: 200 }, "bottom-start", viewport);
  assert.ok(result.left + 300 <= viewport.width);
  assert.ok(result.top + 200 <= viewport.height);
});

test("placeAtPoint clamps a context-menu point near the corner", () => {
  const result = placeAtPoint({ x: 998, y: 798 }, { width: 200, height: 150 }, viewport);
  assert.ok(result.left + 200 <= viewport.width);
  assert.ok(result.top + 150 <= viewport.height);
});

// ---- resolveVerticalPlacement (Select's "flip above when there's no room below") ----

test("resolveVerticalPlacement: keeps the preferred bottom placement when it fits", () => {
  const anchor = { top: 100, left: 50, width: 200, height: 30 };
  assert.equal(resolveVerticalPlacement(anchor, { width: 180, height: 120 }, "bottom-start", viewport), "bottom-start");
});

test("resolveVerticalPlacement: flips to top when bottom doesn't fit but top does", () => {
  const anchor = { top: 700, left: 50, width: 200, height: 30 }; // bottom edge at 730, 70px of room below
  const result = resolveVerticalPlacement(anchor, { width: 180, height: 300 }, "bottom-start", viewport);
  assert.equal(result, "top-start");
});

test("resolveVerticalPlacement: keeps the horizontal half (start/end) unchanged when it flips", () => {
  const anchor = { top: 700, left: 50, width: 200, height: 30 };
  const result = resolveVerticalPlacement(anchor, { width: 180, height: 300 }, "bottom-end", viewport);
  assert.equal(result, "top-end");
});

test("resolveVerticalPlacement: does not flip when neither side fits (the clamp handles it instead)", () => {
  const anchor = { top: 400, left: 50, width: 200, height: 30 };
  // panel taller than either half of an 800px-tall viewport
  const result = resolveVerticalPlacement(anchor, { width: 180, height: 790 }, "bottom-start", viewport);
  assert.equal(result, "bottom-start");
});

test("resolveVerticalPlacement: flips from top back to bottom when top doesn't fit but bottom does", () => {
  const anchor = { top: 20, left: 50, width: 200, height: 30 }; // only 20px of room above
  const result = resolveVerticalPlacement(anchor, { width: 180, height: 120 }, "top-start", viewport);
  assert.equal(result, "bottom-start");
});
