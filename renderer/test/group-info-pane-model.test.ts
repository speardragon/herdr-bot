import { test } from "node:test";
import assert from "node:assert/strict";
import { groupInfoPaneChrome, initialGroupInfoPage } from "../src/production/group-info-pane-model.ts";

// herdr-bot: the group info pane has two pages after the Grok Bot reference. The chat header opens
// the *settings* page (A: `<` 설정 `>>`); its back button goes to the *members* page (B: ⚙ `>>`),
// whose gear returns to settings. Only the palette's explicit "members" entry lands on B directly.

test("header click and the generic palette entry open the settings page", () => {
  assert.equal(initialGroupInfoPage("header"), "settings");
  assert.equal(initialGroupInfoPage("palette-group"), "settings");
});

test("the palette's members entry opens the members page", () => {
  assert.equal(initialGroupInfoPage("palette-members"), "members");
});

test("settings page: titled, back goes to members, no gear", () => {
  assert.deepEqual(groupInfoPaneChrome("settings"), { title: "Settings", back: "members", settings: null });
});

test("members page: untitled, no back, gear goes to settings", () => {
  assert.deepEqual(groupInfoPaneChrome("members"), { title: null, back: null, settings: "settings" });
});
