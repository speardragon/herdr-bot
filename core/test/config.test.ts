import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir } from "node:os";
import { hostPaths, resolveConfig } from "../src/config.ts";

test("resolveConfig defaults home to ~/.herdr-bot and herdr to PATH binary", () => {
  const config = resolveConfig({});
  assert.equal(config.home, join(homedir(), ".herdr-bot"));
  assert.equal(config.herdrBin, "herdr");
  assert.equal(config.controlSocketPath, join(homedir(), ".herdr-bot", "host.sock"));
  assert.equal(config.cliPath, join(homedir(), ".herdr-bot", "bin", "herdr-bot"));
  assert.equal(config.turnTimeoutMs, 180_000);
  assert.equal(config.defaultKind, "claude");
});

test("resolveConfig honours env overrides and ignores garbage numbers", () => {
  const config = resolveConfig({
    HERDR_BOT_HOME: "/tmp/hb",
    HERDR_BIN_PATH: "/opt/herdr",
    HERDR_SOCKET_PATH: "/tmp/h.sock",
    HERDR_BOT_USER_NAME: "ray",
    HERDR_BOT_TURN_TIMEOUT_MS: "abc",
    HERDR_BOT_DEFAULT_KIND: "codex",
  });
  assert.equal(config.home, "/tmp/hb");
  assert.equal(config.herdrBin, "/opt/herdr");
  assert.equal(config.herdrSocketPath, "/tmp/h.sock");
  assert.equal(config.userName, "ray");
  assert.equal(config.turnTimeoutMs, 180_000);
  assert.equal(config.defaultKind, "codex");
});

test("hostPaths lays out bots, rooms, and state", () => {
  assert.equal(hostPaths.botProfile("/h", "rev"), "/h/bots/rev/profile.json");
  assert.equal(hostPaths.roomTranscript("/h", "room-x-1a2b"), "/h/rooms/room-x-1a2b/transcript.jsonl");
  assert.equal(hostPaths.viewState("/h"), "/h/state/view-state.json");
  assert.equal(hostPaths.workspaces("/h"), "/h/state/workspaces.json");
});
