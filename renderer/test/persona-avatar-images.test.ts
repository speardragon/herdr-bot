import { test } from "node:test";
import assert from "node:assert/strict";
import { personaAvatarImageSrc } from "../src/production/persona-avatar-images.ts";

// herdr-bot: an agent's avatar swaps the drawn persona mark for a real image when its resolved color
// (character.tsx's eleven names) has one mapped. Only "green" has an image today; every other color
// -- including one that just isn't in the map yet -- keeps the existing mark.
test("personaAvatarImageSrc: the mapped URL for a known color, null for everything else", () => {
  const images = { green: "green-bot.png" };
  assert.equal(personaAvatarImageSrc(images, "green"), "green-bot.png");
  assert.equal(personaAvatarImageSrc(images, "blue"), null, "a valid persona color with no mapped image");
  assert.equal(personaAvatarImageSrc({}, "green"), null, "an empty map maps nothing");
  assert.equal(personaAvatarImageSrc(images, "not-a-real-color"), null);
});
