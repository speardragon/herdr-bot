import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAvatarCharacter, avatarCharacterChanged } from "../src/production/apply-avatar-character.ts";

test("applyAvatarCharacter patches only the matching agent's color/shape, leaving others by reference", () => {
  const bystander = { id: "b", avatarColor: "red", avatarShape: "blob", avatarDataUrl: null };
  const agents = [
    { id: "a", avatarColor: "gray", avatarShape: null, avatarDataUrl: null },
    bystander,
  ];
  const next = applyAvatarCharacter(agents, "a", { avatarColor: "blue", avatarShape: "cloud", hasExistingAvatar: false });
  assert.deepEqual(next[0], { id: "a", avatarColor: "blue", avatarShape: "cloud", avatarDataUrl: null });
  assert.equal(next[1], bystander);
});

test("applyAvatarCharacter nulls avatarDataUrl when hasExistingAvatar is false (a colour pick drops the saved photo)", () => {
  const agents = [{ id: "a", avatarColor: null, avatarShape: null, avatarDataUrl: "data:image/png;base64,x" }];
  const next = applyAvatarCharacter(agents, "a", { avatarColor: "blue", avatarShape: null, hasExistingAvatar: false });
  assert.equal(next[0].avatarDataUrl, null);
});

test("applyAvatarCharacter keeps the existing avatarDataUrl when hasExistingAvatar is true", () => {
  const agents = [{ id: "a", avatarColor: null, avatarShape: null, avatarDataUrl: "data:image/png;base64,x" }];
  const next = applyAvatarCharacter(agents, "a", { avatarColor: "blue", avatarShape: null, hasExistingAvatar: true });
  assert.equal(next[0].avatarDataUrl, "data:image/png;base64,x");
});

test("applyAvatarCharacter is a no-op list when the id has no match", () => {
  const agents = [{ id: "a", avatarColor: "red", avatarShape: null, avatarDataUrl: null }];
  const next = applyAvatarCharacter(agents, "missing", { avatarColor: "blue", avatarShape: null, hasExistingAvatar: false });
  assert.deepEqual(next, agents);
});

test("avatarCharacterChanged detects a color, a shape, or a hasExistingAvatar change; false when identical", () => {
  const base = { avatarColor: "red", avatarShape: "blob", hasExistingAvatar: true };
  assert.equal(avatarCharacterChanged(base, { ...base }), false);
  assert.equal(avatarCharacterChanged(base, { ...base, avatarColor: "blue" }), true);
  assert.equal(avatarCharacterChanged(base, { ...base, avatarShape: "cloud" }), true);
  assert.equal(avatarCharacterChanged(base, { ...base, hasExistingAvatar: false }), true);
});
