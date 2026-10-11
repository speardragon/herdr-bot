import { test } from "node:test";
import assert from "node:assert/strict";
import { placeholderKey } from "../src/features/composer/placeholder.ts";

test("a bot chat uses the dative (에게) placeholder key", () => {
  assert.equal(placeholderKey("bot"), "composer.placeholder.bot");
});

test("a room chat uses the locative (에) placeholder key", () => {
  assert.equal(placeholderKey("room"), "composer.placeholder.room");
});
