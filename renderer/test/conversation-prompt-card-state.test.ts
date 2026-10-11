import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePromptCardView, optionBadgeLabel, seedCheckedOptions } from "../src/features/conversation/prompt-card-state.ts";
import type { PendingPrompt, TranscriptEntry } from "../src/data/types.ts";

function prompt(signature: string, overrides: Partial<PendingPrompt> = {}): PendingPrompt {
  return {
    kind: "permission",
    title: null,
    header: null,
    progress: null,
    question: "Proceed?",
    body: [],
    options: [{ key: "A", label: "Yes", detail: null, selected: false, checked: null }],
    multiSelect: false,
    freeTextKey: null,
    signature,
    ...overrides,
  };
}

function promptEntry(status: string, sig: string, rest: Record<string, unknown> = {}): TranscriptEntry {
  return { id: "p1", kind: "prompt", seq: 1, timestampMs: 0, prompt: prompt(sig), status, ...rest };
}

test("hidden when the entry has no valid prompt payload", () => {
  assert.equal(derivePromptCardView({ id: "x", kind: "prompt", seq: 1, timestampMs: 0 }, null).mode, "hidden");
});

test("hidden for a superseded entry even if signatures would otherwise match", () => {
  const view = derivePromptCardView(promptEntry("superseded", "sig-1"), prompt("sig-1"));
  assert.equal(view.mode, "hidden");
});

test("live when the entry's signature matches the chat's current live pendingPrompt", () => {
  const live = prompt("sig-1");
  const view = derivePromptCardView(promptEntry("pending", "sig-1"), live);
  assert.equal(view.mode, "live");
  assert.equal(view.prompt, live);
});

test("inert (\"answered in the terminal\") when signatures don't match and nothing is known about the answer", () => {
  const view = derivePromptCardView(promptEntry("resolved", "sig-old"), prompt("sig-new"));
  assert.equal(view.mode, "inert");
});

test("inert when the bot has no live pendingPrompt at all", () => {
  const view = derivePromptCardView(promptEntry("pending", "sig-1"), null);
  assert.equal(view.mode, "inert");
});

test("answered when the entry carries a resolved answer and the signature no longer matches live", () => {
  const view = derivePromptCardView(promptEntry("answered", "sig-old", { answer: { kind: "option", key: "A", label: "Yes" } }), prompt("sig-new"));
  assert.equal(view.mode, "answered");
  assert.deepEqual(view.answer, { kind: "option", key: "A", label: "Yes" });
});

test("answered from options[].selected when there is no separate answer field", () => {
  const selectedPrompt = prompt("sig-old", { options: [{ key: "A", label: "Yes", detail: null, selected: true, checked: null }] });
  const entry: TranscriptEntry = { id: "p1", kind: "prompt", seq: 1, timestampMs: 0, prompt: selectedPrompt, status: "answered" };
  const view = derivePromptCardView(entry, prompt("sig-new"));
  assert.equal(view.mode, "answered");
});

test("seedCheckedOptions: empty for a single-select card", () => {
  assert.deepEqual(seedCheckedOptions(prompt("s", { multiSelect: false })), {});
});

test("seedCheckedOptions: seeds from option.checked for a multi-select card", () => {
  const multi = prompt("s", {
    multiSelect: true,
    options: [
      { key: "A", label: "Small", detail: null, selected: false, checked: true },
      { key: "B", label: "Large", detail: null, selected: false, checked: false },
    ],
  });
  assert.deepEqual(seedCheckedOptions(multi), { A: true, B: false });
});

test("optionBadgeLabel: positional letters regardless of the host's own option.key", () => {
  assert.equal(optionBadgeLabel(0), "A");
  assert.equal(optionBadgeLabel(1), "B");
  assert.equal(optionBadgeLabel(2), "C");
  assert.equal(optionBadgeLabel(25), "Z");
});

test("optionBadgeLabel: wraps to two letters past Z", () => {
  assert.equal(optionBadgeLabel(26), "AA");
  assert.equal(optionBadgeLabel(27), "AB");
});
