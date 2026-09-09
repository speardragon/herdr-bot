import assert from "node:assert/strict";
import { test } from "node:test";
import { accountInitials } from "../src/recovered/features/account/session/initials.ts";

test("two or more words: first character of the first two words", () => {
  assert.equal(accountInitials("창룡 강"), "창강");
  assert.equal(accountInitials("Donald Duck"), "DD");
  assert.equal(accountInitials("Ada Byron Lovelace"), "AB");
});

test("one word: its first two characters", () => {
  assert.equal(accountInitials("ray"), "RA");
  assert.equal(accountInitials("강"), "강");
});

test("latin initials are upper-cased; whitespace is trimmed and collapsed", () => {
  assert.equal(accountInitials("  donald   duck  "), "DD");
  assert.equal(accountInitials(""), "");
  assert.equal(accountInitials("   "), "");
});

test("characters outside the BMP are not split in half", () => {
  assert.equal(accountInitials("😀 x"), "😀X");
  assert.equal(accountInitials("😀🎉🎈"), "😀🎉");
});
