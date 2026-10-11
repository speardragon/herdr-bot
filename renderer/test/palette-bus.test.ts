import { test } from "node:test";
import assert from "node:assert/strict";
import { onPaletteOpenRequested, requestPaletteOpen } from "../src/features/palette/palette-bus.ts";

test("requestPaletteOpen notifies every subscriber with the initial query", () => {
  const received: string[] = [];
  const unsubscribe = onPaletteOpenRequested((request) => received.push(request.initialQuery));
  requestPaletteOpen("hello");
  unsubscribe();
  requestPaletteOpen("ignored, unsubscribed");
  assert.deepEqual(received, ["hello"]);
});

test("requestPaletteOpen defaults to an empty initial query", () => {
  const received: string[] = [];
  const unsubscribe = onPaletteOpenRequested((request) => received.push(request.initialQuery));
  requestPaletteOpen();
  unsubscribe();
  assert.deepEqual(received, [""]);
});
