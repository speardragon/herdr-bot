import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOCALE, parseLocale, t } from "../src/i18n/index.ts";

test("DEFAULT_LOCALE is Korean", () => {
  assert.equal(DEFAULT_LOCALE, "ko");
});

test("parseLocale falls back to the default for anything unrecognized", () => {
  assert.equal(parseLocale("en"), "en");
  assert.equal(parseLocale("fr"), "ko");
  assert.equal(parseLocale(null), "ko");
  assert.equal(parseLocale(undefined), "ko");
});

test("t() resolves a real key from every registered feature fragment", () => {
  assert.equal(t("en", "common.cancel"), "Cancel");
  assert.equal(t("ko", "common.cancel"), "취소");
  assert.equal(t("en", "sidebar.search"), "Search");
  assert.equal(t("ko", "sidebar.search"), "검색");
  // composer.placeholder is now kind-specific (composer.placeholder.bot/.room) -- see
  // features/composer/placeholder.ts: a bot is addressed with 에게 (dative), a room with 에 (locative).
  assert.equal(t("en", "composer.placeholder.bot", { chatName: "Atlas" }), "Message Atlas");
  assert.equal(t("ko", "composer.placeholder.bot", { chatName: "Atlas" }), "Atlas에게 메시지 보내기");
  assert.equal(t("en", "composer.placeholder.room", { chatName: "Atlas" }), "Message Atlas");
  assert.equal(t("ko", "composer.placeholder.room", { chatName: "Atlas" }), "Atlas에 메시지 보내기");
});
