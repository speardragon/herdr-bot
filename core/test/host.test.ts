import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli, type HerdrCli } from "../src/herdr/cli.ts";
import { HerdrError } from "../src/herdr/types.ts";
import { controlRequest } from "../src/control/client.ts";
import { ControlError } from "../src/control/protocol.ts";
import { setLogSink } from "../src/log.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("host serves the control protocol end to end", async () => {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [], onPrompt: { a: { say: ["A here"], sayOnce: true }, b: { say: ["B here"], sayOnce: true } } });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null });
  await host.start();
  const sock = config.controlSocketPath;
  try {
    await controlRequest(sock, "bot.create", { id: "a", name: "A" });
    await controlRequest(sock, "bot.create", { id: "b", name: "B", kind: "codex", permissionMode: "auto" });
    const room = (await controlRequest(sock, "room.create", { name: "Auth", memberIds: ["a", "b"] })) as { id: string };
    const sent = (await controlRequest(sock, "send", { chatId: room.id, text: "hello team" })) as { entryId: string };
    assert.equal(sent.entryId, "e1");
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const read = (await controlRequest(sock, "read", { chatId: room.id })) as { entries: { author: string; text: string }[] };
    assert.deepEqual(read.entries.map((e) => `${e.author}: ${e.text}`), ["ray: hello team", "A: A here", "B: B here"]);
    const who = (await controlRequest(sock, "whoami", { paneId: "w1:p1" })) as { bot: { id: string } };
    assert.equal(who.bot.id, "a");
    await assert.rejects(controlRequest(sock, "whoami", { paneId: "w9:p9" }), (e: unknown) => e instanceof ControlError && e.code === "unknown_pane");
    const rooms = (await controlRequest(sock, "rooms", {})) as { rooms: { id: string }[] };
    assert.equal(rooms.rooms[0]?.id, room.id);
    const status = (await controlRequest(sock, "status", {})) as { bots: number; rooms: number };
    assert.deepEqual([status.bots, status.rooms], [2, 1]);
    await assert.rejects(controlRequest(sock, "nope", {}), (e: unknown) => e instanceof ControlError && e.code === "unknown_method");
  } finally {
    await host.stop();
    temp.cleanup();
  }
});

test("deleting and recreating a bot with the same id starts with an empty transcript and fresh view state", async () => {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [], onPrompt: { reviewer: { say: ["hi from reviewer"], sayOnce: true } } });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null });
  await host.start();
  const sock = config.controlSocketPath;
  try {
    await controlRequest(sock, "bot.create", { id: "reviewer", name: "Reviewer" });
    await controlRequest(sock, "send", { chatId: "reviewer", text: "hello" });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const before = (await controlRequest(sock, "read", { chatId: "reviewer" })) as { entries: unknown[] };
    assert.ok(before.entries.length > 0, "expected transcript entries before delete");
    const beforeAgents = (await controlRequest(sock, "bot.list", {})) as { agents: { id: string; hasUnread: boolean }[] };
    assert.equal(beforeAgents.agents.find((a) => a.id === "reviewer")?.hasUnread, true);

    await controlRequest(sock, "bot.delete", { id: "reviewer" });
    await controlRequest(sock, "bot.create", { id: "reviewer", name: "Reviewer Again" });

    const after = (await controlRequest(sock, "read", { chatId: "reviewer" })) as { entries: unknown[] };
    assert.deepEqual(after.entries, []);
    const afterAgents = (await controlRequest(sock, "bot.list", {})) as { agents: { id: string; hasUnread: boolean; lastActivityAt: number; lastViewedAt: number }[] };
    const revived = afterAgents.agents.find((a) => a.id === "reviewer");
    assert.equal(revived?.hasUnread, false, "the recreated bot should not inherit the deleted bot's unread state");
    assert.equal(revived?.lastActivityAt, 0, "the recreated bot should not inherit the deleted bot's view state");
  } finally {
    await host.stop();
    temp.cleanup();
  }
});

test("bot.create maps a failing agentStart to herdr_error, and a duplicate id to invalid_params", async () => {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const baseCli = createHerdrCli(fake.binPath, fake.env);
  const failingCli: HerdrCli = { ...baseCli, async agentStart() { throw new HerdrError("herdr_error", "boom"); } };
  const failingHost = createHost(config, { cli: failingCli, socketPath: null });
  await failingHost.start();
  try {
    setLogSink(() => undefined);
    await assert.rejects(
      controlRequest(config.controlSocketPath, "bot.create", { id: "boom", name: "Boom" }),
      (e: unknown) => e instanceof ControlError && e.code === "herdr_error",
    );
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await failingHost.stop();
  }

  const workingHost = createHost(config, { cli: baseCli, socketPath: null });
  await workingHost.start();
  try {
    await controlRequest(config.controlSocketPath, "bot.create", { id: "a", name: "A" });
    await assert.rejects(
      controlRequest(config.controlSocketPath, "bot.create", { id: "a", name: "A again" }),
      (e: unknown) => e instanceof ControlError && e.code === "invalid_params",
    );
  } finally {
    await workingHost.stop();
    temp.cleanup();
  }
});
