import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("desktop:package builds both DMG architectures, with electron-builder last so `-- --publish never` forwards", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["desktop:package"], "npm run desktop:build && npx electron-builder --config electron-builder.yml --project desktop");
});

test("desktop:package:dir builds only the unpacked .app for local testing, also with electron-builder last", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["desktop:package:dir"], "npm run desktop:build && npx electron-builder --config electron-builder.yml --project desktop --dir");
});

test("electron-builder.yml packages both arm64 and x64 DMGs, unsigned, into .build/desktop/, with the bundled dist/** (which includes the compiled CLI)", () => {
  const yaml = readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8");
  assert.match(yaml, /output: \.\.\/\.build\/desktop/);
  assert.match(yaml, /target: dmg/);
  assert.match(yaml, /target: zip/); // what the in-app updater downloads
  assert.match(yaml, /arch: \[arm64, x64\]/);
  assert.match(yaml, /identity: null/);
  assert.match(yaml, /artifactName: herdr-bot-\$\{version\}-\$\{arch\}\.\$\{ext\}/);
  assert.match(yaml, /- dist\/\*\*/);
});
