import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { hostPaths } from "../src/config.ts";
import { ProfileStore, projectBotProfile } from "../src/store/profile-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile } from "./helpers/fixtures.ts";

test("profile store round-trips, lists sorted by id, and deletes the bot directory", () => {
  const temp = makeTempHome();
  try {
    const store = new ProfileStore(temp.home);
    store.save(sampleProfile({ id: "zed", name: "Zed" }));
    store.save(sampleProfile());
    assert.deepEqual(store.list().map((profile) => profile.id), ["reviewer", "zed"]);
    assert.equal(store.get("reviewer")?.name, "Reviewer");
    assert.equal(store.get("nope"), null);
    store.delete("zed");
    assert.equal(existsSync(hostPaths.bot(temp.home, "zed")), false);
    assert.deepEqual(store.list().map((profile) => profile.id), ["reviewer"]);
  } finally {
    temp.cleanup();
  }
});

test("projectBotProfile keeps an optional string title and omits the key when it is absent or malformed", () => {
  const withTitle = projectBotProfile({ ...sampleProfile(), title: "research" });
  assert.equal(withTitle?.title, "research");
  const withoutTitle = projectBotProfile(sampleProfile());
  assert.equal(withoutTitle == null ? "missing" : "title" in withoutTitle, false);
  const malformed = projectBotProfile({ ...sampleProfile(), title: 42 });
  assert.equal(malformed == null ? "missing" : "title" in malformed, false);
});

test("projectBotProfile rejects malformed profiles and fills optional booleans", () => {
  assert.equal(projectBotProfile({ id: "x" }), null);
  const projected = projectBotProfile({ ...sampleProfile(), notifyOnUpdatesEnabled: undefined, isHiddenFromSidebar: undefined });
  assert.equal(projected?.notifyOnUpdatesEnabled, true);
  assert.equal(projected?.isHiddenFromSidebar, false);
  assert.equal(projectBotProfile({ ...sampleProfile(), permissionMode: "yolo" }), null);
});

test("projectBotProfile round-trips an onboarding block and drops a malformed one", () => {
  const withOnboarding = projectBotProfile({ ...sampleProfile(), onboarding: { requestId: "r-1", locale: "ko", stage: "greeting", error: null } });
  assert.deepEqual(withOnboarding?.onboarding, { requestId: "r-1", locale: "ko", stage: "greeting", error: null });
  // A bad stage / locale drops the field entirely rather than rejecting the whole profile.
  assert.equal(projectBotProfile({ ...sampleProfile(), onboarding: { requestId: "r-1", locale: "ko", stage: "nope", error: null } })?.onboarding, undefined);
  assert.equal(projectBotProfile(sampleProfile())?.onboarding, undefined);
});

test("older bot profiles load with null launch selections", () => {
  const { model: _model, reasoningEffort: _reasoningEffort, ...old } = sampleProfile({ id: "old", name: "Old" });
  const bot = projectBotProfile(old);
  assert.equal(bot?.model, null);
  assert.equal(bot?.reasoningEffort, null);
});

test("projectBotProfile trims models and drops invalid launch selections", () => {
  assert.deepEqual(
    { model: projectBotProfile({ ...sampleProfile(), model: "  gpt-5.4  " })?.model, reasoningEffort: projectBotProfile({ ...sampleProfile(), reasoningEffort: "xhigh" })?.reasoningEffort },
    { model: "gpt-5.4", reasoningEffort: "xhigh" },
  );
  assert.equal(projectBotProfile({ ...sampleProfile(), model: "   ", reasoningEffort: "ultra" })?.model, null);
  assert.equal(projectBotProfile({ ...sampleProfile(), reasoningEffort: "ultra" })?.reasoningEffort, null);
});
