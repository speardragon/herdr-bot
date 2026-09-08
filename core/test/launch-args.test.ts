import { test } from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_KINDS, launchArgsFor } from "../src/bots/launch-args.ts";

const cli = "/Users/ray/.herdr-bot/bin/herdr-bot";

test("claude: ask mode only pre-approves the herdr-bot CLI, auto bypasses permissions", () => {
  assert.deepEqual(launchArgsFor("claude", "ask", cli), ["--allowedTools", `Bash(${cli} *)`]);
  assert.deepEqual(launchArgsFor("claude", "auto", cli), ["--permission-mode", "bypassPermissions"]);
});

test("codex: ask uses defaults, auto follows the to-agents convention", () => {
  assert.deepEqual(launchArgsFor("codex", "ask", cli), []);
  assert.deepEqual(launchArgsFor("codex", "auto", cli), ["-s", "workspace-write", "-a", "on-request"]);
});

test("other kinds start bare", () => {
  assert.deepEqual(launchArgsFor("grok", "auto", cli), []);
  assert.ok(SUPPORTED_KINDS.includes("grok"));
  assert.ok(SUPPORTED_KINDS.includes("claude"));
});
