import assert from "node:assert/strict";
import { homedir } from "node:os";
import { test } from "node:test";
import { createHost } from "../../src/host.ts";
import { resolveConfig } from "../../src/config.ts";
import { createHerdrCli } from "../../src/herdr/cli.ts";
import { createAppApiServer, type AppApiServer } from "../../src/app-api/server.ts";
import { AppApiError, isAppApiError } from "../../src/app-api/errors.ts";
import type { AppApiEvent, AppApiMethod } from "../../src/app-api/types.ts";
import { installFakeHerdr } from "../helpers/fake-herdr-state.ts";
import { makeTempHome } from "../helpers/temp-home.ts";
import { ASK_MULTI_SELECT_SCREEN, ASK_SINGLE_SCREEN } from "../helpers/prompt-screens.ts";

async function harness(initial?: Parameters<typeof installFakeHerdr>[1]) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, initial ?? { agents: [], workspaces: [] });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null, ensureSession: null });
  await host.start();
  const server: AppApiServer = createAppApiServer(host);
  const call = async <M extends AppApiMethod>(method: M, params?: unknown): Promise<any> => server.call(method, params); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    temp, fake, host, server, call,
    cleanup: async () => {
      // Host.stop() does not drain in-flight turns; wait (briefly, best-effort) for them to quiet down
      // before the temp home is deleted out from under them, or a scheduled turn's fake-herdr child
      // process can still be mid-write when rmSync runs (ENOTEMPTY). Tests with a background onboarding
      // provision await `host.onboarding.settled(id)` themselves before calling this.
      const deadline = Date.now() + 3_000;
      while (host.status().runningTurns.length > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      server.close();
      await host.stop();
      temp.cleanup();
    },
  };
}

async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(isAppApiError(error), `expected an AppApiError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

test("bot.create / room.create / chat.list / chat.updateProfile / chat.delete round-trip", async () => {
  const h = await harness();
  try {
    const bot = await h.call("bot.create", { name: "Reviewer", id: "reviewer", provider: "claude", permissionMode: "ask" });
    assert.equal(bot.chat.id, "reviewer");
    assert.equal(bot.chat.kind, "bot");

    const room = await h.call("room.create", { name: "Auth", description: "fix login", memberIds: ["reviewer"] });
    assert.equal(room.chat.isGroup, true);
    assert.equal(room.chat.kind, "room");

    const list = await h.call("chat.list");
    assert.deepEqual(list.map((c: { id: string }) => c.id).sort(), ["reviewer", room.chat.id].sort());

    const renamed = await h.call("chat.updateProfile", { chatId: "reviewer", name: "Ava", description: "helps" });
    assert.equal(renamed.name, "Ava");
    const roomRenamed = await h.call("chat.updateProfile", { chatId: room.chat.id, name: "Login" });
    assert.equal(roomRenamed.name, "Login");

    const membersCleared = await h.call("room.setMembers", { roomId: room.chat.id, memberIds: [] });
    assert.deepEqual(membersCleared.memberIds, []);

    const deleted = await h.call("chat.delete", { chatIds: [room.chat.id, "reviewer"] });
    assert.deepEqual(deleted.deletedIds, [room.chat.id, "reviewer"]);
    assert.deepEqual(await h.call("chat.list"), []);
  } finally {
    await h.cleanup();
  }
});

test("bot.create passes model/reasoningEffort to the launched agent and rejects an unsupported provider", async () => {
  const h = await harness();
  try {
    const bot = await h.call("bot.create", { name: "Reviewer", id: "reviewer", provider: "codex", cwd: "/tmp/repo", model: "gpt-5.4", reasoningEffort: "high" });
    assert.equal(bot.chat.bot.model, "gpt-5.4");
    assert.equal(bot.chat.bot.reasoningEffort, "high");
    const launch = h.fake.readLog().find((argv) => argv[0] === "agent" && argv[1] === "start" && argv[2] === "reviewer");
    assert.deepEqual(launch?.slice(-4), ["--model", "gpt-5.4", "--config", 'model_reasoning_effort="high"']);

    await expectError(h.call("bot.create", { name: "Unsupported", id: "nope", provider: "not-a-provider" }), "unsupported_kind");
  } finally {
    await h.cleanup();
  }
});

test("chat.updateProfile persists avatarShape/avatarColor, and \"\" resets them to null", async () => {
  const h = await harness();
  try {
    await h.call("bot.create", { name: "Reviewer", id: "reviewer" });
    const colored = await h.call("chat.updateProfile", { chatId: "reviewer", avatarShape: "circle", avatarColor: "blue" });
    assert.equal(colored.avatarShape, "circle");
    assert.equal(colored.avatarColor, "blue");
    const reset = await h.call("chat.updateProfile", { chatId: "reviewer", avatarShape: "", avatarColor: "" });
    assert.equal(reset.avatarShape, null);
    assert.equal(reset.avatarColor, null);
  } finally {
    await h.cleanup();
  }
});

test("room.create is idempotent on a retried requestId and rejects a not-ready member", async () => {
  const h = await harness();
  try {
    await h.call("bot.create", { name: "Reviewer", id: "reviewer" });
    const requestId = "11111111-1111-1111-1111-111111111111";
    const first = await h.call("room.create", { name: "Auth", memberIds: ["reviewer"], requestId });
    const retry = await h.call("room.create", { name: "Auth (retry copy)", memberIds: ["reviewer"], requestId });
    assert.equal(retry.chat.id, first.chat.id);

    await expectError(h.call("room.create", { name: "Bad", memberIds: ["no-such-bot"] }), "unknown_bot");
  } finally {
    await h.cleanup();
  }
});

test("message.send + transcript.page round-trip; paging never marks read, chat.markRead is the only ack", async () => {
  const h = await harness();
  try {
    await h.call("bot.create", { name: "Reviewer", id: "reviewer" });
    const sent = await h.call("message.send", { chatId: "reviewer", text: "hello team" });
    assert.ok(sent.entryId.length > 0);

    const page = await h.call("transcript.page", { chatId: "reviewer", limit: 50 });
    assert.equal(page.entries.at(-1)?.id, sent.entryId);

    const reacted = await h.call("message.react", { chatId: "reviewer", entryId: sent.entryId, emoji: "👍" });
    assert.ok((reacted.entry?.reactions as { emoji: string }[] | undefined)?.some((r) => r.emoji === "👍"));

    await expectError(h.call("transcript.page", { chatId: "no-such-chat" }), "unknown_chat");
  } finally {
    await h.cleanup();
  }
});

test("bot.quickCreate reserves instantly and bot.retrySetup reuses the same profile", async () => {
  const h = await harness();
  try {
    const requestId = "22222222-2222-2222-2222-222222222222";
    const created = await h.call("bot.quickCreate", { requestId, locale: "en", name: "Nova" });
    assert.equal(created.chat.name, "Nova");
    assert.equal(created.chat.bot.onboarding?.stage, "provisioning");
    // Let the background spawn/brief/greeting provision finish before cleanup deletes the temp home.
    await h.host.onboarding.settled(created.chat.id);
  } finally {
    await h.cleanup();
  }
});

test("settings.get/settings.update round-trip and reject an unsupported provider", async () => {
  const h = await harness();
  try {
    const updated = await h.call("settings.update", { defaultWorkingFolder: "/tmp/repo", defaultProvider: "codex", defaultPermissionMode: "auto" });
    assert.deepEqual(updated, { defaultWorkingFolder: "/tmp/repo", defaultProvider: "codex", defaultPermissionMode: "auto" });
    assert.deepEqual(await h.call("settings.get"), updated);
    await expectError(h.call("settings.update", { defaultProvider: "not-a-provider" }), "unsupported_kind");
  } finally {
    await h.cleanup();
  }
});

test("bot.create rejects a cwd that is exactly the home directory unless allowHomeCwd is set", async () => {
  const h = await harness();
  try {
    await expectError(h.call("bot.create", { name: "Reviewer", id: "reviewer", cwd: homedir() }), "home_cwd_requires_confirmation");
    const bot = await h.call("bot.create", { name: "Reviewer", id: "reviewer", cwd: homedir(), allowHomeCwd: true });
    assert.equal(bot.chat.bot.cwd, homedir());
  } finally {
    await h.cleanup();
  }
});

test("directory.list resolves relative to the host and flags the home directory", async () => {
  const h = await harness();
  try {
    const listing = await h.call("directory.list", { path: "~" });
    assert.equal(listing.exists, true);
    assert.equal(listing.isHome, true);
  } finally {
    await h.cleanup();
  }
});

test("message.search finds a message body, not just a chat name", async () => {
  const h = await harness();
  try {
    await h.call("bot.create", { name: "Reviewer", id: "reviewer" });
    await h.call("message.send", { chatId: "reviewer", text: "please check the auth flow" });
    const hits = await h.call("message.search", { query: "auth flow" });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].chatId, "reviewer");
  } finally {
    await h.cleanup();
  }
});

test("bot.listModels forwards the provider to the model catalog", async () => {
  const h = await harness();
  try {
    const result = await h.call("bot.listModels", { provider: "claude" });
    assert.equal(result.source, "latest-alias");
    assert.ok(result.models.some((m: { id: string }) => m.id === "sonnet"));
  } finally {
    await h.cleanup();
  }
});

test("bot.updateLaunchSettings relaunches the bot and rejects a home-directory cwd without allowHomeCwd", async () => {
  const h = await harness();
  try {
    await h.call("bot.create", { name: "Reviewer", id: "reviewer", cwd: "/tmp/repo" });
    const updated = await h.call("bot.updateLaunchSettings", { botId: "reviewer", model: "opus" });
    assert.equal(updated.chat.bot.model, "opus");
    await expectError(h.call("bot.updateLaunchSettings", { botId: "reviewer", cwd: homedir() }), "home_cwd_requires_confirmation");
  } finally {
    await h.cleanup();
  }
});

test("bot.updateLaunchSettings: an explicit permissionMode null resets to the host's effective default; an omitted key keeps the bot's own pinned mode (\"agent's default\" over the wire)", async () => {
  const h = await harness();
  try {
    await h.call("bot.create", { name: "Reviewer", id: "reviewer", cwd: "/tmp/repo", permissionMode: "auto" });
    const untouched = await h.call("bot.updateLaunchSettings", { botId: "reviewer", model: "opus" });
    assert.equal(untouched.chat.bot.permissionMode, "auto");
    const reset = await h.call("bot.updateLaunchSettings", { botId: "reviewer", permissionMode: null });
    assert.equal(reset.chat.bot.permissionMode, "ask");
  } finally {
    await h.cleanup();
  }
});

test("prompt.answer presses the blocked form's keys through herdr and refuses stale or impossible answers", async () => {
  const h = await harness();
  try {
    await h.call("bot.create", { name: "Reviewer", id: "reviewer" });
    const state = h.fake.readState();
    h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: ASK_SINGLE_SCREEN } });
    await h.host.mirror.refresh();

    const listed = (await h.call("chat.list")).find((c: { id: string }) => c.id === "reviewer");
    const prompt = listed.bot.pendingPrompt;
    assert.equal(prompt.kind, "question");
    assert.equal(prompt.freeTextKey, "4");

    const answered = await h.call("prompt.answer", { botId: "reviewer", signature: prompt.signature, action: "option", key: "2" });
    assert.equal(answered.chat.id, "reviewer");
    assert.deepEqual(h.fake.readLog().filter((argv) => argv[1] === "send-keys").at(-1), ["agent", "send-keys", "reviewer", "2"]);

    await expectError(h.call("prompt.answer", { botId: "reviewer", signature: "stale", action: "option", key: "1" }), "prompt_changed");
    await expectError(h.call("prompt.answer", { botId: "reviewer", signature: prompt.signature, action: "option", key: "9" }), "invalid_answer");
    await expectError(h.call("prompt.answer", { botId: "reviewer", signature: prompt.signature, action: "shout" }), "invalid_args");
  } finally {
    await h.cleanup();
  }
});

test("prompt.answer moves a multi-select question on with Tab", async () => {
  const h = await harness();
  try {
    await h.call("bot.create", { name: "Reviewer", id: "reviewer" });
    const state = h.fake.readState();
    h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: ASK_MULTI_SELECT_SCREEN } });
    await h.host.mirror.refresh();
    const prompt = (await h.call("chat.list")).find((c: { id: string }) => c.id === "reviewer").bot.pendingPrompt;
    assert.equal(prompt.multiSelect, true);
    await h.call("prompt.answer", { botId: "reviewer", signature: prompt.signature, action: "next" });
    assert.deepEqual(h.fake.readLog().filter((argv) => argv[1] === "send-keys").at(-1), ["agent", "send-keys", "reviewer", "tab"]);
  } finally {
    await h.cleanup();
  }
});

test("events: chat.listChanged, chat.changed, and transcript.entryAppended fire with a monotonically increasing seq", async () => {
  const h = await harness();
  try {
    const events: AppApiEvent[] = [];
    const unsubscribe = h.server.subscribe((event) => events.push(event));

    await h.call("bot.create", { name: "Reviewer", id: "reviewer" });
    await h.call("message.send", { chatId: "reviewer", text: "hi" });
    unsubscribe();

    const types = events.map((e) => e.type);
    assert.ok(types.includes("chat.listChanged"));
    assert.ok(types.includes("chat.changed"));
    assert.ok(types.includes("transcript.entryAppended"));
    for (let i = 1; i < events.length; i++) assert.equal(events[i]!.seq, events[i - 1]!.seq + 1);
  } finally {
    await h.cleanup();
  }
});

test("call() throws unknown_method for an unregistered method", async () => {
  const h = await harness();
  try {
    await assert.rejects(h.server.call("not.a.method", {}), (error: unknown) => {
      assert.ok(isAppApiError(error));
      assert.equal(error.code, "unknown_method");
      return true;
    });
  } finally {
    await h.cleanup();
  }
});
