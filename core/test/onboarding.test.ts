import { test } from "node:test";
import assert from "node:assert/strict";
import { HERDR_AGENT_NAME_PATTERN, greetingText, reservedBotId } from "../src/bots/onboarding.ts";

test("the app-owned greeting asks the purpose directly", () => {
  for (const locale of ["ko", "en"] as const) {
    const text = greetingText(locale);
    assert.equal(text.split("\n\n").length, 2, `${locale}: two paragraphs`);
    assert.ok(text.includes("?"));
  }
});

test("the reserved bot id is a valid herdr agent name (herdr rejects names over 32 chars) and stays deterministic", () => {
  const id = reservedBotId("df1d49c0-053a-40f4-9273-2253ae6ad589");
  assert.equal(id, "bot-df1d49c0053a");
  assert.match(id, HERDR_AGENT_NAME_PATTERN);
  assert.ok(id.length <= 32);
  assert.equal(reservedBotId("df1d49c0-053a-40f4-9273-2253ae6ad589"), id, "same request -> same profile");
  assert.notEqual(reservedBotId("11111111-2222-3333-4444-555555555555"), id);
});
