import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PERSONA_COLOR, PERSONA_COLORS, personaColorForId, resolvePersonaColor } from "../src/data/avatar-colors.ts";

test("PERSONA_COLORS has the 11 fixed swatches in picker order", () => {
  assert.deepEqual(PERSONA_COLORS, ["black", "brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"]);
});

test("resolvePersonaColor passes through a known color", () => {
  assert.equal(resolvePersonaColor("violet"), "violet");
});

test("resolvePersonaColor falls back to default for null/unset/unknown", () => {
  assert.equal(resolvePersonaColor(null), DEFAULT_PERSONA_COLOR);
  assert.equal(resolvePersonaColor(""), DEFAULT_PERSONA_COLOR);
  assert.equal(resolvePersonaColor("not-a-real-color"), DEFAULT_PERSONA_COLOR);
});

test("personaColorForId is deterministic for the same id", () => {
  assert.equal(personaColorForId("atlas"), personaColorForId("atlas"));
});

test("personaColorForId always returns a valid swatch", () => {
  for (const id of ["a", "bb", "ccc", "some-long-bot-id"]) {
    assert.ok((PERSONA_COLORS as readonly string[]).includes(personaColorForId(id)));
  }
});
