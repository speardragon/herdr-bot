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
  assert.equal(config.herdrSession, "herdr-bot");
  assert.equal(config.herdrSocketPath, join(homedir(), ".config", "herdr", "sessions", "herdr-bot", "herdr.sock"));
});

test("HERDR_BOT_SESSION=default targets the main herdr session and its socket", () => {
  const config = resolveConfig({ HERDR_BOT_SESSION: "default" });
  assert.equal(config.herdrSession, "default");
  assert.equal(config.herdrSocketPath, join(homedir(), ".config", "herdr", "herdr.sock"));
  assert.equal(resolveConfig({ HERDR_BOT_SESSION: "lab" }).herdrSocketPath, join(homedir(), ".config", "herdr", "sessions", "lab", "herdr.sock"));
});

test("resolveConfig honours env overrides and ignores garbage numbers", () => {
  const config = resolveConfig({
    HERDR_BOT_HOME: "/tmp/hb",
    HERDR_BIN_PATH: "/opt/herdr",
    HERDR_SOCKET_PATH: "/tmp/h.sock",
    HERDR_BOT_USER_NAME: "ray",
    HERDR_BOT_TURN_TIMEOUT_MS: "abc",
    HERDR_BOT_DEFAULT_KIND: "codex",
    HERDR_BOT_SESSION: "lab",
  });
  assert.equal(config.herdrSession, "lab");
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
