import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingText, buildGreetingPrompt } from "../src/bots/onboarding.ts";
test("onboarding starts without inventing a user message", () => {
  const prompt = buildGreetingPrompt("bot-abc", "ko");
  assert.ok(prompt.includes(greetingText("ko")));
  assert.ok(prompt.includes("bot-abc"));
  assert.ok(prompt.includes("not a user message"));
});
