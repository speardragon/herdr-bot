import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SettingsStore } from "../src/settings-store.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

test("settings store persists keys with prefixes and survives reload", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "desktop.json");
    const store = new SettingsStore(path);
    assert.equal(store.get("theme", "system"), "system");
    store.set("theme", "dark");
    store.set("persist:composer-drafts", "{}");
    store.set("persist:other", "1");
    assert.deepEqual(new SettingsStore(path).get("theme", "system"), "dark");
    assert.deepEqual(store.keys("persist:").sort(), ["persist:composer-drafts", "persist:other"]);
    store.remove("persist:other");
    assert.deepEqual(store.keys("persist:"), ["persist:composer-drafts"]);
  } finally {
    temp.cleanup();
  }
});
