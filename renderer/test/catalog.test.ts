import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCatalog, translate } from "../src/i18n/catalog.ts";

test("mergeCatalog combines fragments, later fragments winning on key collision", () => {
  const catalog = mergeCatalog([
    { en: { a: "A" }, ko: { a: "가" } },
    { en: { a: "A2", b: "B" }, ko: { a: "가2", b: "나" } },
  ]);
  assert.equal(catalog.en.a, "A2");
  assert.equal(catalog.en.b, "B");
  assert.equal(catalog.ko.a, "가2");
});

test("translate falls back to English, then the bare key", () => {
  const catalog = mergeCatalog([{ en: { onlyEn: "hello" }, ko: {} }]);
  assert.equal(translate(catalog, "ko", "onlyEn"), "hello");
  assert.equal(translate(catalog, "ko", "missing.key"), "missing.key");
});

test("translate interpolates {vars}", () => {
  const catalog = mergeCatalog([{ en: { greet: "Hello, {name}!" }, ko: { greet: "안녕, {name}!" } }]);
  assert.equal(translate(catalog, "en", "greet", { name: "Ray" }), "Hello, Ray!");
});

test("translate leaves an unmatched {placeholder} alone", () => {
  const catalog = mergeCatalog([{ en: { x: "a {missing} b" }, ko: {} }]);
  assert.equal(translate(catalog, "en", "x"), "a {missing} b");
});
