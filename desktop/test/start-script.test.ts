import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("desktop start builds both bundles", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["desktop:start"], "npm run desktop:build && npm run start -w @herdr-bot/desktop");
});
