import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundlePathFromExe, findAsset, parseSha256Sums, swapScript, updateAssetNames } from "../src/app-update.ts";
import { appMenuTemplate, menuLanguage, updateText } from "../src/app-menu.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

const HASH = "a".repeat(64);

test("updateAssetNames: the zip for this Mac's architecture, plus the checksums", () => {
  assert.deepEqual(updateAssetNames("1.2.0", "arm64"), { archive: "herdr-bot-1.2.0-arm64.zip", sums: "SHA256SUMS.txt" });
  const assets = [{ name: "herdr-bot-1.2.0-x64.zip", url: "x" }, { name: "herdr-bot-1.2.0-arm64.zip", url: "a" }];
  assert.equal(findAsset(assets, "herdr-bot-1.2.0-arm64.zip")?.url, "a");
  assert.equal(findAsset(assets, "herdr-bot-1.2.0-arm64.dmg"), null);
});

test("parseSha256Sums reads shasum's text and binary lines, and skips anything else", () => {
  const sums = parseSha256Sums(`${HASH}  herdr-bot-1.2.0-arm64.zip\n${"B".repeat(64)} *herdr-bot-1.2.0-x64.zip\nnot a line\n`);
  assert.equal(sums.get("herdr-bot-1.2.0-arm64.zip"), HASH);
  assert.equal(sums.get("herdr-bot-1.2.0-x64.zip"), "b".repeat(64));
  assert.equal(sums.size, 2);
});

test("bundlePathFromExe finds the .app around a macOS executable, and nothing for other layouts", () => {
  assert.equal(bundlePathFromExe("/Applications/herdr-bot.app/Contents/MacOS/herdr-bot"), "/Applications/herdr-bot.app");
  assert.equal(bundlePathFromExe("/repo/node_modules/electron/dist/Electron"), null);
});

function runSwap(home: string, setup: (paths: { target: string; staged: string }) => void) {
  const target = join(home, "Apps", "herdr-bot.app");
  const staged = join(home, "work", "unpacked", "herdr-bot.app");
  const workDir = join(home, "work");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "version"), "old");
  setup({ target, staged });
  // A pid that is already gone, so the script does not wait; `open` is replaced so nothing launches.
  const script = swapScript({ pid: 999_999, target, staged, backup: join(home, "Apps", ".herdr-bot.app.previous"), workDir, logFile: join(home, "update.log") })
    .replace(/^open .*$/m, `echo opened > ${join(home, "opened")}`);
  const scriptPath = join(home, "swap.sh");
  writeFileSync(scriptPath, script);
  spawnSync("/bin/sh", [scriptPath]);
  return { target, workDir };
}

test("swapScript replaces the bundle, removes the backup and work dir, and opens the app", () => {
  const temp = makeTempHome();
  try {
    const { target, workDir } = runSwap(temp.home, ({ staged }) => { mkdirSync(staged, { recursive: true }); writeFileSync(join(staged, "version"), "new"); });
    assert.equal(readFileSync(join(target, "version"), "utf8"), "new");
    assert.equal(existsSync(join(temp.home, "Apps", ".herdr-bot.app.previous")), false);
    assert.equal(existsSync(workDir), false);
    assert.equal(existsSync(join(temp.home, "opened")), true);
  } finally {
    temp.cleanup();
  }
});

test("swapScript puts the old bundle back when the new one cannot be moved in", () => {
  const temp = makeTempHome();
  try {
    const { target } = runSwap(temp.home, () => { mkdirSync(join(temp.home, "work"), { recursive: true }); }); // no staged app
    assert.equal(readFileSync(join(target, "version"), "utf8"), "old");
    assert.match(readFileSync(join(temp.home, "update.log"), "utf8"), /kept the old one/);
  } finally {
    temp.cleanup();
  }
});

test("swapScript quotes paths with spaces and quotes", () => {
  const script = swapScript({ pid: 1, target: "/Users/a b/it's.app", staged: "/s", backup: "/b", workDir: "/w", logFile: "/l" });
  assert.match(script, /mv '\/Users\/a b\/it'\\''s\.app' '\/b'/);
  assert.doesNotThrow(() => execFileSync("/bin/sh", ["-n", "-c", script]));
});

test("menuLanguage follows the app setting, then the system locale", () => {
  assert.equal(menuLanguage("ko", "en-US"), "ko");
  assert.equal(menuLanguage(null, "ko-KR"), "ko");
  assert.equal(menuLanguage("en", "ko-KR"), "en");
});

test("the app menu keeps Edit (copy/paste) and View, and puts Check for Updates under About", () => {
  const template = appMenuTemplate("herdr-bot", "ko", () => {});
  assert.deepEqual(template.slice(1).map((item) => item.role), ["editMenu", "viewMenu", "windowMenu"]);
  const appItems = template[0]?.submenu as { role?: string; label?: string }[];
  assert.equal(appItems[0]?.role, "about");
  assert.equal(appItems[1]?.label, updateText("ko").checkForUpdates);
  assert.ok(appItems.some((item) => item.role === "quit"));
});
