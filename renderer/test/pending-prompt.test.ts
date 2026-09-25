import { test } from "node:test";
import assert from "node:assert/strict";
import { optionLetter, projectPromptShape } from "../src/production/pending-prompt.ts";

const RAW = {
  kind: "question",
  title: null,
  header: "←  ☐ Size  ☐ Toppings  ✔ Submit  →",
  progress: { done: 0, total: 2 },
  question: "Which size?",
  body: [],
  options: [
    { key: "1", label: "Small", detail: "Small size", selected: true, checked: null },
    { key: "2", label: "Large", detail: "Large size", selected: false, checked: null },
    { key: "3", label: "Type something.", detail: null, selected: false, checked: null },
  ],
  multiSelect: false,
  freeTextKey: "3",
  signature: "sig-1",
};

test("projects a host prompt, separating the free-text row from the pickable options", () => {
  const prompt = projectPromptShape(RAW);
  assert.ok(prompt);
  assert.equal(prompt.kind, "question");
  assert.equal(prompt.question, "Which size?");
  assert.equal(prompt.signature, "sig-1");
  assert.deepEqual(prompt.progress, { done: 0, total: 2 });
  assert.deepEqual(prompt.options.map((o) => [o.key, o.label, o.detail, o.checked]), [["1", "Small", "Small size", null], ["2", "Large", "Large size", null]]);
  assert.equal(prompt.freeTextKey, "3");
  assert.equal(prompt.multiSelect, false);
  assert.equal(prompt.title, null);
});

test("keeps permission prompts' title and body, and reports no free text", () => {
  const prompt = projectPromptShape({ ...RAW, kind: "permission", title: "Bash command", header: null, progress: null, question: "Do you want to proceed?", body: ["rm -rf /tmp/x", "Remove x"], options: [{ key: "1", label: "Yes", detail: null, selected: true, checked: null }, { key: "3", label: "No", detail: null, selected: false, checked: null }], freeTextKey: null });
  assert.ok(prompt);
  assert.equal(prompt.kind, "permission");
  assert.equal(prompt.title, "Bash command");
  assert.deepEqual(prompt.body, ["rm -rf /tmp/x", "Remove x"]);
  assert.equal(prompt.freeTextKey, null);
  assert.deepEqual(prompt.options.map((o) => o.key), ["1", "3"]);
});

test("multi-select rows keep their checkbox state", () => {
  const prompt = projectPromptShape({ ...RAW, multiSelect: true, freeTextKey: "4", options: [{ key: "1", label: "Cheese", detail: null, selected: true, checked: true }, { key: "2", label: "Olives", detail: null, selected: false, checked: false }, { key: "4", label: "Type something", detail: "Submit", selected: false, checked: false }] });
  assert.ok(prompt);
  assert.equal(prompt.multiSelect, true);
  assert.deepEqual(prompt.options.map((o) => [o.key, o.checked]), [["1", true], ["2", false]]);
});

test("an unknown form keeps its question and body with no options", () => {
  const prompt = projectPromptShape({ ...RAW, kind: "unknown", header: null, progress: null, question: "Do you trust the files in this folder?", body: ["/repo"], options: [], freeTextKey: null });
  assert.ok(prompt);
  assert.equal(prompt.kind, "unknown");
  assert.deepEqual(prompt.options, []);
  assert.deepEqual(prompt.body, ["/repo"]);
});

test("malformed or absent prompts project to null", () => {
  assert.equal(projectPromptShape(null), null);
  assert.equal(projectPromptShape("nope"), null);
  assert.equal(projectPromptShape({ ...RAW, signature: "" }), null);
  assert.equal(projectPromptShape({ ...RAW, kind: "weird" }), null);
  assert.equal(projectPromptShape({ ...RAW, options: [{ key: 1, label: "x" }] }), null);
  assert.equal(projectPromptShape({ ...RAW, question: 42 }), null);
});

test("option letters run A, B, C … in row order", () => {
  assert.deepEqual([0, 1, 2, 25].map(optionLetter), ["A", "B", "C", "Z"]);
  assert.equal(optionLetter(26), "27");
});
