import { test } from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_KINDS, launchArgsFor, providerLaunchCapabilities } from "../src/bots/launch-args.ts";

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

test("provider launch options become exact CLI arguments", () => {
  const cli = "/opt/herdr-bot";
  assert.deepEqual(launchArgsFor("claude", "ask", cli, { model: "claude-sonnet-4-5", reasoningEffort: "high" }), [
    "--allowedTools", `Bash(${cli} *)`, "--model", "claude-sonnet-4-5", "--effort", "high",
  ]);
  assert.deepEqual(launchArgsFor("codex", "auto", cli, { model: "gpt-5.4", reasoningEffort: "xhigh" }), [
    "-s", "workspace-write", "-a", "on-request", "--model", "gpt-5.4", "--config", 'model_reasoning_effort="xhigh"',
  ]);
  assert.deepEqual(launchArgsFor("grok", "ask", cli, { model: "grok-code-fast-1", reasoningEffort: "high" }), [
    "--model", "grok-code-fast-1", "--reasoning-effort", "high",
  ]);
  assert.deepEqual(launchArgsFor("gemini", "ask", cli, { model: "gemini-2.5-pro", reasoningEffort: null }), ["--model", "gemini-2.5-pro"]);
  assert.deepEqual(launchArgsFor("opencode", "ask", cli, { model: "anthropic/claude-sonnet-4-5", reasoningEffort: null }), ["--model", "anthropic/claude-sonnet-4-5"]);
});

test("provider capabilities reject unsupported reasoning", () => {
  assert.equal(providerLaunchCapabilities("gemini").reasoning, false);
  assert.throws(
    () => launchArgsFor("gemini", "ask", "/opt/herdr-bot", { model: null, reasoningEffort: "high" }),
    /gemini does not support reasoning effort/,
  );
});
