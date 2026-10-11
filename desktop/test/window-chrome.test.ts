import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WINDOW_SIZE, LIGHT_WINDOW_BACKGROUND, MIN_WINDOW_SIZE, WINDOW_BACKGROUND, shouldHideInsteadOfClose, shouldQuitOnWindowAllClosed, windowBackground, windowChromeOptions } from "../src/window-chrome.ts";

test("mac uses a hidden-inset title bar with traffic lights", () => {
  assert.deepEqual(windowChromeOptions("darwin"), { frame: true, titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 15 } });
});

test("windows uses a title bar overlay and linux a plain frameless window", () => {
  assert.deepEqual(windowChromeOptions("win32"), { frame: false, titleBarStyle: "hidden", titleBarOverlay: { height: 51, color: "#121411", symbolColor: "#FFFFFF" } });
  assert.deepEqual(windowChromeOptions("linux"), { frame: false, titleBarStyle: "default" });
  assert.deepEqual([MIN_WINDOW_SIZE, DEFAULT_WINDOW_SIZE, WINDOW_BACKGROUND], [{ width: 512, height: 520 }, { width: 1040, height: 760 }, "#121411"]);
});

test("window background follows the resolved theme so light windows do not flash dark", () => {
  assert.equal(windowBackground(true), WINDOW_BACKGROUND);
  assert.equal(windowBackground(false), LIGHT_WINDOW_BACKGROUND);
  assert.equal(LIGHT_WINDOW_BACKGROUND, "#fcfcfc");
});

test("mac hides on close unless the app is quitting; every other platform's close is unaffected", () => {
  assert.equal(shouldHideInsteadOfClose("darwin", false), true);
  assert.equal(shouldHideInsteadOfClose("darwin", true), false);
  assert.equal(shouldHideInsteadOfClose("win32", false), false);
  assert.equal(shouldHideInsteadOfClose("linux", false), false);
});

test("only mac keeps running (for the Dock icon / activate) after every window closes", () => {
  assert.equal(shouldQuitOnWindowAllClosed("darwin"), false);
  assert.equal(shouldQuitOnWindowAllClosed("win32"), true);
  assert.equal(shouldQuitOnWindowAllClosed("linux"), true);
});
