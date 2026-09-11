import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WINDOW_SIZE, LIGHT_WINDOW_BACKGROUND, MIN_WINDOW_SIZE, WINDOW_BACKGROUND, windowBackground, windowChromeOptions } from "../src/window-chrome.ts";

test("mac uses hidden-inset traffic lights like grok-bot", () => {
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
