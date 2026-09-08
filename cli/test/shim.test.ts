import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { installShim, shimScript } from "../src/shim.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

test("shim execs node on the CLI entry with all arguments", () => {
  assert.equal(shimScript("/usr/local/bin/node", "/repo/cli/src/main.ts"), '#!/bin/sh\nexec "/usr/local/bin/node" "/repo/cli/src/main.ts" "$@"\n');
});

test("installShim writes an executable at <home>/bin/herdr-bot", () => {
  const temp = makeTempHome();
  try {
    const path = installShim(temp.home, "/usr/local/bin/node", "/repo/cli/src/main.ts");
    assert.equal(path, join(temp.home, "bin", "herdr-bot"));
    assert.match(readFileSync(path, "utf8"), /exec "\/usr\/local\/bin\/node"/);
    assert.equal(statSync(path).mode & 0o111, 0o111);
  } finally {
    temp.cleanup();
  }
});
