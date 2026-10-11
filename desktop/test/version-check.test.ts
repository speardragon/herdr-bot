import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, isNewerVersion } from "../src/version-check.ts";

test("compareVersions orders by major, then minor, then patch", () => {
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.2.4", "1.2.3"), 1);
  assert.equal(compareVersions("1.2.3", "1.2.4"), -1);
  assert.equal(compareVersions("1.3.0", "1.2.9"), 1);
  assert.equal(compareVersions("2.0.0", "1.9.9"), 1);
});

test("compareVersions treats a missing trailing part as 0", () => {
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(compareVersions("1.2.1", "1.2"), 1);
});

test("compareVersions strips a leading v and a -beta/-rc/+build suffix (GitHub tag conventions)", () => {
  assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.2.3-beta.1", "1.2.3"), 0);
  assert.equal(compareVersions("1.2.3+abcdef", "1.2.3"), 0);
});

test("isNewerVersion is true only when the candidate is strictly greater than current", () => {
  assert.equal(isNewerVersion("0.1.0", "0.1.1"), true);
  assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
  assert.equal(isNewerVersion("0.1.1", "0.1.0"), false, "an older/rolled-back tag is never \"newer\"");
  assert.equal(isNewerVersion("0.1.0", "v0.2.0"), true);
});
