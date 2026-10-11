import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { installShim, shimScript } from "../src/shim.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

test("shim pins HERDR_BOT_HOME and execs node on the CLI entry with all arguments", () => {
  assert.equal(
    shimScript("/usr/local/bin/node", "/repo/cli/src/main.ts", "/home/herdr-bot"),
    "#!/bin/sh\nexport HERDR_BOT_HOME='/home/herdr-bot'\nexec '/usr/local/bin/node' '/repo/cli/src/main.ts' \"$@\"\n",
  );
});

test("shim single-quote-escapes paths so spaces, $, and embedded quotes survive unmolested", () => {
  const script = shimScript("/Applications/My App.app/Contents/MacOS/node", "/repo/cli/src/main.ts", "/Users/ray/it's mine");
  assert.match(script, /^#!\/bin\/sh\n/);
  assert.match(script, /export HERDR_BOT_HOME='\/Users\/ray\/it'\\''s mine'\n/);
  assert.match(script, /exec '\/Applications\/My App\.app\/Contents\/MacOS\/node' '\/repo\/cli\/src\/main\.ts' "\$@"\n$/);
});

test("the electronRunAsNode option prefixes the exec line so a compiled CLI can run under Electron-as-node", () => {
  const script = shimScript("/Applications/herdr-bot.app/Contents/MacOS/herdr-bot", "/Applications/herdr-bot.app/Contents/Resources/app/dist/cli/src/main.js", "/home/herdr-bot", { electronRunAsNode: true });
  assert.equal(
    script,
    "#!/bin/sh\nexport HERDR_BOT_HOME='/home/herdr-bot'\nELECTRON_RUN_AS_NODE=1 exec '/Applications/herdr-bot.app/Contents/MacOS/herdr-bot' '/Applications/herdr-bot.app/Contents/Resources/app/dist/cli/src/main.js' \"$@\"\n",
  );
});

test("installShim writes an executable at <home>/bin/herdr-bot", () => {
  const temp = makeTempHome();
  try {
    const path = installShim(temp.home, "/usr/local/bin/node", "/repo/cli/src/main.ts");
    assert.equal(path, join(temp.home, "bin", "herdr-bot"));
    const contents = readFileSync(path, "utf8");
    assert.match(contents, /exec '\/usr\/local\/bin\/node'/);
    assert.match(contents, new RegExp(`export HERDR_BOT_HOME='${temp.home}'`));
    assert.equal(statSync(path).mode & 0o111, 0o111);
  } finally {
    temp.cleanup();
  }
});

test("installShim skips the write (and the chmod) when the content would be unchanged", () => {
  const temp = makeTempHome();
  try {
    const path = installShim(temp.home, "/usr/local/bin/node", "/repo/cli/src/main.ts");
    chmodSync(path, 0o644); // simulate permission drift after the first install
    installShim(temp.home, "/usr/local/bin/node", "/repo/cli/src/main.ts");
    assert.equal(statSync(path).mode & 0o777, 0o644, "identical content must not be rewritten (or rechmod'd)");
  } finally {
    temp.cleanup();
  }
});

test("installShim rewrites (and fixes permissions) when the content actually changes", () => {
  const temp = makeTempHome();
  try {
    const path = installShim(temp.home, "/usr/local/bin/node", "/repo/cli/src/main.ts");
    chmodSync(path, 0o644);
    installShim(temp.home, "/usr/local/bin/node-v2", "/repo/cli/src/main.ts");
    assert.match(readFileSync(path, "utf8"), /node-v2/);
    assert.equal(statSync(path).mode & 0o111, 0o111);
  } finally {
    temp.cleanup();
  }
});
