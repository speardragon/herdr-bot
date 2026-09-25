import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCreateBotRequest,
  isValidBotId,
  suggestBotId,
  supportsModelSelection,
  supportsReasoningEffort,
  uniqueBotId,
} from "../src/production/new-chat-dialog-model.ts";

// herdr-bot (Task 7): NewChatDialog.tsx stays a thin presentational shell -- the request-building
// logic that used to only be reachable through simulated form events is extracted here so it is
// testable directly (see new-chat-model.test.ts for the header's equivalent split).

test("buildCreateBotRequest trims the model id and derives the bot id from the name when spawning", () => {
  assert.deepEqual(
    buildCreateBotRequest({
      name: "Reviewer",
      description: "Reviews changes",
      kind: "codex",
      cwd: "/work/repo",
      permissionMode: "auto",
      model: " gpt-5.4 ",
      reasoningEffort: "high",
      source: "__spawn__",
      takenIds: new Set(),
    }),
    {
      id: "reviewer",
      name: "Reviewer",
      description: "Reviews changes",
      kind: "codex",
      cwd: "/work/repo",
      permissionMode: "auto",
      model: "gpt-5.4",
      reasoningEffort: "high",
    },
  );
});

test("buildCreateBotRequest clears model/reasoningEffort and attaches adoptPaneId when adopting a pane", () => {
  assert.deepEqual(
    buildCreateBotRequest({
      name: "Adopted",
      description: "",
      kind: "codex",
      cwd: "/work/repo",
      permissionMode: "ask",
      model: "gpt-5.4",
      reasoningEffort: "high",
      source: "w1:p2",
      takenIds: new Set(),
    }),
    {
      id: "adopted",
      name: "Adopted",
      description: "",
      kind: "codex",
      cwd: "/work/repo",
      permissionMode: "ask",
      model: null,
      reasoningEffort: null,
      adoptPaneId: "w1:p2",
    },
  );
});

test("buildCreateBotRequest treats a blank/omitted model as the CLI default (null)", () => {
  const request = buildCreateBotRequest({
    name: "Blank Model",
    description: "",
    kind: "claude",
    cwd: "/work",
    permissionMode: "ask",
    model: "   ",
    reasoningEffort: null,
    source: "__spawn__",
    takenIds: new Set(),
  });
  assert.equal(request.model, null);
});

test("buildCreateBotRequest appends -2, -3, ... on id collision", () => {
  const taken = new Set(["reviewer", "reviewer-2"]);
  const request = buildCreateBotRequest({
    name: "Reviewer",
    description: "",
    kind: "claude",
    cwd: "/work",
    permissionMode: "ask",
    model: null,
    reasoningEffort: null,
    source: "__spawn__",
    takenIds: taken,
  });
  assert.equal(request.id, "reviewer-3");
});

test("suggestBotId/isValidBotId/uniqueBotId (regression: extracted unchanged from NewChatDialog.tsx)", () => {
  assert.equal(suggestBotId("Code Reviewer!!"), "code-reviewer");
  assert.equal(suggestBotId(""), "bot");
  assert.equal(isValidBotId("reviewer"), true);
  assert.equal(isValidBotId("room-1"), false);
  assert.equal(uniqueBotId("Reviewer", new Set()), "reviewer");
  assert.equal(uniqueBotId("Reviewer", new Set(["reviewer"])), "reviewer-2");
});

test("model selection is supported for claude/codex/grok/gemini/opencode only (mirrors core providerLaunchCapabilities)", () => {
  for (const kind of ["claude", "codex", "grok", "gemini", "opencode"]) assert.equal(supportsModelSelection(kind), true);
  assert.equal(supportsModelSelection("cursor"), false);
});

test("reasoning effort is supported for claude/codex/grok only", () => {
  for (const kind of ["claude", "codex", "grok"]) assert.equal(supportsReasoningEffort(kind), true);
  for (const kind of ["gemini", "opencode", "cursor"]) assert.equal(supportsReasoningEffort(kind), false);
});
