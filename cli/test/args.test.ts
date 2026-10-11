import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "../src/args.ts";

const env = { HERDR_PANE_ID: "w1:p2" };

test("profile commands scope edits to the caller and preserve empty fields for clearing", () => {
  assert.deepEqual(parseCliArgs(["profile", "get"], env), { kind: "control", method: "profile.get", params: { paneId: "w1:p2" }, output: "json" });
  assert.deepEqual(parseCliArgs(["profile", "update", "--name", "레이", "--label", "", "--description", "코드 리뷰"], env),
    { kind: "control", method: "profile.update", params: { paneId: "w1:p2", name: "레이", title: "", description: "코드 리뷰" }, output: "json" });
  for (const args of [[], ["--name"], ["--name", " "], ["--id", "other"]]) {
    assert.ok("error" in parseCliArgs(["profile", "update", ...args], env));
  }
});

test("say joins the remaining words and carries the pane id", () => {
  assert.deepEqual(parseCliArgs(["say", "room-1", "hello", "there"], env), { kind: "control", method: "say", params: { chatId: "room-1", text: "hello there", paneId: "w1:p2" }, output: "json" });
  assert.deepEqual(parseCliArgs(["pass", "room-1"], env), { kind: "control", method: "pass", params: { chatId: "room-1", paneId: "w1:p2" }, output: "json" });
  assert.deepEqual(parseCliArgs(["say", "room-1"], env), { error: "say needs <chatId> and <text>" });
});

test("message carries the caller pane and preserves a quoted multiline body", () => {
  assert.deepEqual(parseCliArgs(["message", "bot-b", "First line\nSecond line"], env),
    { kind: "control", method: "message", params: { paneId: "w1:p2", chatId: "bot-b", text: "First line\nSecond line" }, output: "json" });
  assert.deepEqual(parseCliArgs(["message", "room-1", "hello", "there"], env),
    { kind: "control", method: "message", params: { paneId: "w1:p2", chatId: "room-1", text: "hello there" }, output: "json" });
  assert.deepEqual(parseCliArgs(["message", "bot-b"], env), { error: "message needs <chatId> and <text>" });
  assert.deepEqual(parseCliArgs(["message"], env), { error: "message needs <chatId> and <text>" });
});

test("read/rooms/whoami/status/send map to control methods", () => {
  assert.deepEqual(parseCliArgs(["read", "room-1", "--limit", "5"], env), { kind: "control", method: "read", params: { chatId: "room-1", limit: 5 }, output: "transcript" });
  assert.deepEqual(parseCliArgs(["rooms"], env), { kind: "control", method: "rooms", params: {}, output: "json" });
  assert.deepEqual(parseCliArgs(["whoami"], env), { kind: "control", method: "whoami", params: { paneId: "w1:p2" }, output: "json" });
  assert.deepEqual(parseCliArgs(["send", "room-1", "go", "team"], env), { kind: "control", method: "send", params: { chatId: "room-1", text: "go team" }, output: "json" });
  assert.deepEqual(parseCliArgs(["status"], env), { kind: "control", method: "status", params: {}, output: "json" });
});

test("bot and room admin commands", () => {
  assert.deepEqual(parseCliArgs(["bot", "create", "reviewer", "--name", "Code Reviewer", "--kind", "claude", "--cwd", "/repo", "--permission", "auto"], env),
    { kind: "control", method: "bot.create", params: { id: "reviewer", name: "Code Reviewer", kind: "claude", cwd: "/repo", permissionMode: "auto" }, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "adopt", "w7:p3", "scout"], env), { kind: "control", method: "bot.adopt", params: { paneId: "w7:p3", id: "scout", name: "scout" }, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "list"], env), { kind: "control", method: "bot.list", params: {}, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "adoptable"], env), { kind: "control", method: "bot.adoptable", params: {}, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "delete", "x"], env), { kind: "control", method: "bot.delete", params: { id: "x" }, output: "json" });
  assert.deepEqual(parseCliArgs(["room", "create", "Auth", "--members", "a,b"], env), { kind: "control", method: "room.create", params: { name: "Auth", memberIds: ["a", "b"] }, output: "json" });
  assert.deepEqual(parseCliArgs(["room", "members", "room-1", "a"], env), { kind: "control", method: "room.set-members", params: { id: "room-1", memberIds: ["a"] }, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "create", "--name", "x"], env), { error: "bot create needs <id>" });
});

test("bot create accepts working directory and launch selections", () => {
  assert.deepEqual(parseCliArgs(["bot", "create", "reviewer", "--cwd", "/work/repo", "--kind", "codex", "--model", "gpt-5.4", "--reasoning", "high"], env),
    { kind: "control", method: "bot.create", params: { id: "reviewer", name: "reviewer", cwd: "/work/repo", kind: "codex", model: "gpt-5.4", reasoningEffort: "high" }, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "create", "reviewer", "--reasoning", "ultra"], env),
    { error: "--reasoning must be one of: low, medium, high, xhigh, max" });
  assert.deepEqual(parseCliArgs(["bot", "create", "reviewer", "--model", "--reasoning", "high"], env),
    { error: "--model needs a non-empty value" });
  assert.ok("error" in parseCliArgs(["bot", "adopt", "w7:p3", "scout", "--model", "gpt-5.4"], env));
  assert.ok("error" in parseCliArgs(["bot", "adopt", "w7:p3", "scout", "--reasoning", "high"], env));
});

test("serve and install-shim are local commands; unknown commands error", () => {
  assert.deepEqual(parseCliArgs(["serve"], env), { kind: "serve" });
  assert.deepEqual(parseCliArgs(["install-shim"], env), { kind: "install-shim" });
  assert.deepEqual(parseCliArgs([], env), { error: "usage: herdr-bot <say|message|pass|read|rooms|whoami|send|bot|room|status|serve|install-shim> ...\nexample: herdr-bot bot create reviewer --cwd /work/repo --kind codex --model gpt-5.4 --reasoning high" });
  assert.deepEqual(parseCliArgs(["dance"], env), { error: 'unknown command "dance"' });
});
