import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { listDirectories } from "../src/services/directory-browser.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("an empty input lists the home directory's subdirectories", () => {
  const listing = listDirectories("");
  assert.equal(listing.exists, true);
  assert.ok(Array.isArray(listing.entries));
});

test("a partial segment matches sibling directories by prefix, case-sensitively", () => {
  const temp = makeTempHome();
  try {
    mkdirSync(join(temp.home, "reports"));
    mkdirSync(join(temp.home, "repo-a"));
    mkdirSync(join(temp.home, "other"));
    writeFileSync(join(temp.home, "rep-not-a-dir"), "");
    const listing = listDirectories(join(temp.home, "rep"));
    assert.equal(listing.exists, false);
    assert.deepEqual(listing.entries, [join(temp.home, "repo-a"), join(temp.home, "reports")]);
  } finally {
    temp.cleanup();
  }
});

test("a trailing slash lists that directory's own children", () => {
  const temp = makeTempHome();
  try {
    mkdirSync(join(temp.home, "a"));
    mkdirSync(join(temp.home, "b"));
    const listing = listDirectories(`${temp.home}/`);
    assert.equal(listing.exists, true);
    assert.deepEqual(listing.entries, [join(temp.home, "a"), join(temp.home, "b")]);
  } finally {
    temp.cleanup();
  }
});

test("dotfiles are hidden unless the typed prefix itself starts with a dot", () => {
  const temp = makeTempHome();
  try {
    mkdirSync(join(temp.home, ".hidden"));
    mkdirSync(join(temp.home, "visible"));
    assert.deepEqual(listDirectories(`${temp.home}/`).entries, [join(temp.home, "visible")]);
    assert.deepEqual(listDirectories(`${temp.home}/.`).entries, [join(temp.home, ".hidden")]);
  } finally {
    temp.cleanup();
  }
});

test("~ expands to the home directory", () => {
  const listing = listDirectories("~");
  assert.equal(listing.exists, true);
  const home = homedir();
  const listingSlash = listDirectories("~/");
  assert.deepEqual(listingSlash.entries, listDirectories(`${home}/`).entries);
});

test("a path that does not exist reports exists: false with no matches", () => {
  const listing = listDirectories("/definitely/not/a/real/path/xyz");
  assert.equal(listing.exists, false);
  assert.deepEqual(listing.entries, []);
});
