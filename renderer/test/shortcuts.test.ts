import { test } from "node:test";
import assert from "node:assert/strict";
import { createShortcutRegistry, matchesCombo, parseCombo } from "../src/shell/shortcuts.ts";

test("parseCombo splits mod/shift/alt from the key", () => {
  assert.deepEqual(parseCombo("mod+k"), { key: "k", mod: true, shift: false, alt: false });
  assert.deepEqual(parseCombo("mod+shift+n"), { key: "n", mod: true, shift: true, alt: false });
  assert.deepEqual(parseCombo("escape"), { key: "escape", mod: false, shift: false, alt: false });
});

test("matchesCombo uses metaKey on darwin, ctrlKey elsewhere", () => {
  const macEvent = { key: "k", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(matchesCombo(macEvent, "mod+k", "darwin"), true);
  assert.equal(matchesCombo(macEvent, "mod+k", "other"), false);

  const winEvent = { key: "k", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false };
  assert.equal(matchesCombo(winEvent, "mod+k", "other"), true);
});

test("createShortcutRegistry dispatches to the first matching handler and reports handled", () => {
  const registry = createShortcutRegistry();
  let fired = 0;
  registry.register("palette", "mod+k", () => {
    fired += 1;
  });
  const handled = registry.dispatch({ key: "k", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, "darwin");
  assert.equal(handled, true);
  assert.equal(fired, 1);
});

test("dispatch returns false when nothing matches", () => {
  const registry = createShortcutRegistry();
  const handled = registry.dispatch({ key: "z", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, "darwin");
  assert.equal(handled, false);
});

test("register() returns an unsubscribe that only removes its own handler", () => {
  const registry = createShortcutRegistry();
  const unregister = registry.register("a", "mod+k", () => {});
  unregister();
  assert.equal(registry.list().length, 0);
});
