import { test } from "node:test";
import assert from "node:assert/strict";
import { blockedPromptSignature, parseBlockedPrompt } from "../src/herdr/blocked-prompt.ts";

import {
  ASK_MULTI_QUESTION_SCREEN as ASK_MULTI_QUESTION,
  ASK_MULTI_SELECT_SCREEN as ASK_MULTI_SELECT,
  ASK_ONBOARDING_SCREEN,
  ASK_WRAPPED_QUESTION_SCREEN,
  ASK_REVIEW_SCREEN as ASK_REVIEW,
  ASK_SINGLE_SCREEN as ASK_SINGLE,
  BASH_PERMISSION_SCREEN as BASH_PERMISSION,
  IDLE_SCREEN as IDLE,
  UNKNOWN_FORM_SCREEN as UNKNOWN_FORM,
} from "./helpers/prompt-screens.ts";

test("parses a Bash permission prompt: tool header, command body, numbered options, cursor", () => {
  const prompt = parseBlockedPrompt(BASH_PERMISSION);
  assert.ok(prompt);
  assert.equal(prompt.kind, "permission");
  assert.equal(prompt.title, "Bash command");
  assert.equal(prompt.question, "Do you want to proceed?");
  assert.deepEqual(prompt.body, [
    "mkdir -p /tmp/hb-probe && rm -rf /tmp/hb-probe",
    "Create and remove a probe directory in /tmp",
    "Ask rule Bash(rm *) overrides auto mode for this command.",
    "/permissions to let auto mode decide",
  ]);
  assert.deepEqual(prompt.options.map((o) => [o.key, o.label, o.detail, o.selected, o.checked]), [
    ["1", "Yes", null, true, null],
    ["2", "Yes, and don’t ask again for: mkdir -p /tmp/hb-probe", null, false, null],
    ["3", "No", null, false, null],
  ]);
  assert.equal(prompt.multiSelect, false);
  assert.equal(prompt.freeTextKey, null);
  assert.equal(prompt.header, null);
  assert.equal(prompt.progress, null);
});

test("parses a single AskUserQuestion: the form sits between two rules and 'Chat about this' is dropped", () => {
  const prompt = parseBlockedPrompt(ASK_SINGLE);
  assert.ok(prompt);
  assert.equal(prompt.kind, "question");
  assert.equal(prompt.title, null);
  assert.equal(prompt.header, "☐ Color");
  assert.deepEqual(prompt.progress, { done: 0, total: 1 });
  assert.equal(prompt.question, "Which color do you prefer?");
  assert.deepEqual(prompt.body, []);
  assert.deepEqual(prompt.options.map((o) => [o.key, o.label, o.detail, o.selected]), [
    ["1", "Red", "warm", true],
    ["2", "Green", "natural", false],
    ["3", "Blue", "calm", false],
    ["4", "Type something.", null, false],
  ]);
  assert.equal(prompt.freeTextKey, "4");
  assert.equal(prompt.multiSelect, false);
});

test("parses the tab strip of a multi-question form into progress", () => {
  const prompt = parseBlockedPrompt(ASK_MULTI_QUESTION);
  assert.ok(prompt);
  assert.equal(prompt.header, "←  ☐ Size  ☐ Toppings  ✔ Submit  →");
  assert.deepEqual(prompt.progress, { done: 0, total: 2 });
  assert.equal(prompt.question, "Which size?");
  assert.equal(prompt.freeTextKey, "3");
  assert.equal(prompt.options.length, 3);
});

test("parses a multi-select question: checkboxes, same-indent detail lines, no trailing period on Type something", () => {
  const prompt = parseBlockedPrompt(ASK_MULTI_SELECT);
  assert.ok(prompt);
  assert.equal(prompt.multiSelect, true);
  assert.deepEqual(prompt.progress, { done: 1, total: 2 });
  assert.deepEqual(prompt.options.map((o) => [o.key, o.label, o.detail, o.checked]), [
    ["1", "Cheese", "Add cheese", true],
    ["2", "Olives", "Add olives", false],
    ["3", "Onion", "Add onion", true],
    ["4", "Type something", "Submit", false],
  ]);
  assert.equal(prompt.freeTextKey, "4");
});

test("parses the review screen as an ordinary question with the answer summary as body", () => {
  const prompt = parseBlockedPrompt(ASK_REVIEW);
  assert.ok(prompt);
  assert.equal(prompt.kind, "question");
  assert.equal(prompt.question, "Ready to submit your answers?");
  assert.deepEqual(prompt.body, ["Review your answers", "● Which size?", "→ Large", "● Which toppings?", "→ Onion"]);
  assert.deepEqual(prompt.options.map((o) => o.label), ["Submit answers", "Cancel"]);
  assert.equal(prompt.freeTextKey, null);
});

test("an idle screen is not a prompt", () => {
  assert.equal(parseBlockedPrompt(IDLE), null);
  assert.equal(parseBlockedPrompt(""), null);
});

test("a blocked form without numbered options becomes an 'unknown' prompt that still names what it saw", () => {
  const prompt = parseBlockedPrompt(UNKNOWN_FORM);
  assert.ok(prompt);
  assert.equal(prompt.kind, "unknown");
  assert.equal(prompt.question, "Do you trust the files in this folder?");
  assert.deepEqual(prompt.body, ["/Users/goorm/Desktop/repo"]);
  assert.deepEqual(prompt.options, []);
});

test("signature identifies the prompt, not the cursor or checkbox state", () => {
  const before = parseBlockedPrompt(ASK_MULTI_SELECT)!;
  const toggled = parseBlockedPrompt(ASK_MULTI_SELECT.replace("1. [✔] Cheese", "1. [ ] Cheese").replace("❯ 1.", "  1.").replace("  2. [ ]", "❯ 2. [ ]"))!;
  assert.equal(before.signature, toggled.signature);
  assert.equal(before.signature, blockedPromptSignature(before));
  const other = parseBlockedPrompt(ASK_SINGLE)!;
  assert.notEqual(before.signature, other.signature);
  // The command appears in the body (the tool card), which is part of the prompt's identity.
  assert.notEqual(parseBlockedPrompt(BASH_PERMISSION)!.signature, parseBlockedPrompt(BASH_PERMISSION.replaceAll("rm -rf /tmp/hb-probe", "rm -rf /tmp/other"))!.signature);
});

test("a long question keeps its bar prefix out of the text and splits a trailing sentence off as a subtitle", () => {
  const prompt = parseBlockedPrompt(ASK_ONBOARDING_SCREEN);
  assert.ok(prompt);
  assert.equal(prompt.header, "☐ 용도");
  assert.equal(prompt.question, "저를 주로 어디에 쓰고 싶으세요?");
  assert.deepEqual(prompt.body, ["가까운 것부터 골라 주시면, 그에 맞춰 바로 맞춰 볼게요."]);
  assert.deepEqual(prompt.options.map((o) => o.label), ["코드·PR·리뷰", "MongoDB·데이터", "장애·APM·운영", "일정·리마인더·잡무", "Type something."]);
  assert.equal(prompt.freeTextKey, "5");

  const wrapped = parseBlockedPrompt(ASK_WRAPPED_QUESTION_SCREEN);
  assert.ok(wrapped);
  assert.equal(wrapped.question, "Which of these areas should I focus on first when I start going through the repository this week?");
  assert.deepEqual(wrapped.body, ["Pick the closest one and I will tailor my first pass to it."]);
});
