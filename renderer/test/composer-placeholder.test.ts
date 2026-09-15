import { test } from "node:test";
import assert from "node:assert/strict";
import { composerPlaceholder } from "../src/production/composer-placeholder.ts";

// herdr-bot: the composer placeholder mirrors Grok Bot's "<chat name>에게 메시지 보내기" -- the
// chat name only, no "@ to mention" suffix (the reference screenshot has none).

test("ko placeholder is '<name>에게 메시지 보내기'", () => {
  assert.equal(composerPlaceholder("APM 확인 봇", "ko"), "APM 확인 봇에게 메시지 보내기");
});

test("en placeholder is 'Message <name>'", () => {
  assert.equal(composerPlaceholder("APM check bot", "en"), "Message APM check bot");
});

test("group names with commas pass through verbatim", () => {
  assert.equal(composerPlaceholder("창룡 강, aidt-edu-core 코드 봇 및 APM 확인 봇", "ko"), "창룡 강, aidt-edu-core 코드 봇 및 APM 확인 봇에게 메시지 보내기");
});

test("blank names fall back to a generic prompt", () => {
  assert.equal(composerPlaceholder("   ", "ko"), "메시지 보내기");
  assert.equal(composerPlaceholder("", "en"), "Send a message");
});
