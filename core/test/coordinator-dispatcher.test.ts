import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { createCoordinatorDispatcher } from "../src/coordinator/dispatcher.ts";
import { createControlHandler } from "../src/control/handlers.ts";
import { ControlError } from "../src/control/protocol.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { greetingText } from "../src/bots/onboarding.ts";

async function harness() {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [], onPrompt: { reviewer: { say: ["hi from reviewer"] } } });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null, ensureSession: null });
  await host.start();
  const dispatch = createCoordinatorDispatcher(host);
  const call = async (method: string, args: unknown = {}) => {
    const outcome = await dispatch(method, args);
    if (outcome.status !== "ok") throw new Error(`${method}: ${outcome.failure.code} ${outcome.failure.message}`);
    return outcome.value as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience
  };
  return { temp, fake, host, dispatch, call, cleanup: async () => { await host.stop(); temp.cleanup(); } };
}

test("createAgent / createGroup / listAgents / updateAgent / deleteAgents round-trip", async () => {
  const h = await harness();
  try {
    const created = await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    assert.equal(created.agent.id, "reviewer");
    assert.deepEqual(created.transcript, []);
    const group = await h.call("createGroup", { name: "Auth", description: "fix login", memberIds: ["reviewer"] });
    assert.equal(group.agent.isGroup, true);
    assert.deepEqual((await h.call("listAgents")).map((a: { id: string }) => a.id).sort(), ["reviewer", group.agent.id].sort());
    assert.equal(await h.call("countAgents"), 2);
    const renamed = await h.call("updateAgent", { id: "reviewer", profile: { name: "Ava", description: "helps" } });
    assert.equal(renamed.name, "Ava");
    assert.equal((await h.call("updateAgent", { id: group.agent.id, profile: { name: "Login", description: "" } })).name, "Login");
    assert.deepEqual(await h.call("setGroupMembers", { id: group.agent.id, memberAgentIds: [] }).then((s: { memberIds: string[] }) => s.memberIds), []);
    assert.deepEqual(await h.call("deleteAgents", { ids: [group.agent.id, "reviewer"] }), { deletedIds: [group.agent.id, "reviewer"] });
    assert.deepEqual(await h.call("listAgents"), []);
  } finally {
    await h.cleanup();
  }
});

test("createAgent passes model and reasoning selections to the launched bot", async () => {
  const h = await harness();
  try {
    const created = await h.call("createAgent", { name: "Reviewer", herdrBot: { id: "reviewer", kind: "codex", cwd: "/tmp/repo", model: "gpt-5.4", reasoningEffort: "high" } });
    assert.equal(created.agent.herdrBot.model, "gpt-5.4");
    assert.equal(created.agent.herdrBot.reasoningEffort, "high");
    const launch = h.fake.readLog().find((argv) => argv[0] === "agent" && argv[1] === "start" && argv[2] === "reviewer");
    assert.deepEqual(launch?.slice(-4), ["--model", "gpt-5.4", "--config", 'model_reasoning_effort="high"']);
  } finally {
    await h.cleanup();
  }
});

test("bot.create control request passes launch selections and rejects unsupported providers", async () => {
  const h = await harness();
  try {
    const control = createControlHandler(h.host);
    const created = await control("bot.create", { id: "reviewer", name: "Reviewer", kind: "codex", cwd: "/tmp/repo", model: "gpt-5.4", reasoningEffort: "max" }) as { herdrBot: { model: string; reasoningEffort: string } };
    assert.equal(created.herdrBot.model, "gpt-5.4");
    assert.equal(created.herdrBot.reasoningEffort, "max");
    await assert.rejects(control("bot.create", { id: "unsupported", name: "Unsupported", kind: "gemini", reasoningEffort: "high" }),
      (error: unknown) => error instanceof ControlError && error.code === "invalid_params");
  } finally {
    await h.cleanup();
  }
});

test("createGroup with a requestId is idempotent on retry and rejects a not-ready member", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const requestId = "22222222-2222-2222-2222-222222222222";
    const first = await h.call("createGroup", { name: "Auth", memberIds: ["reviewer"], requestId });
    const retry = await h.call("createGroup", { name: "Auth", memberIds: ["reviewer"], requestId });
    assert.equal(retry.agent.id, first.agent.id, "a retried createGroup with the same requestId must return the same room, not a duplicate");
    assert.equal((await h.call("listAgents")).filter((a: { id: string; isGroup: boolean }) => a.isGroup).length, 1);

    const badRequestId = await h.dispatch("createGroup", { name: "Auth 2", memberIds: ["reviewer"], requestId: "not-a-uuid" });
    assert.equal(badRequestId.status === "failed" && badRequestId.failure.code, "invalid-args");

    // calls without a requestId keep working (back-compat)
    const noRequestId = await h.call("createGroup", { name: "No Request Id", memberIds: ["reviewer"] });
    assert.equal(noRequestId.agent.isGroup, true);

    const rejected = await h.dispatch("createGroup", { name: "Bad", memberIds: ["missing-bot"] });
    assert.equal(rejected.status === "failed" && rejected.failure.code, "unknown_bot");
  } finally {
    await h.cleanup();
  }
});

test("sendPrompt appends the user message with clientNonce, triggers a turn, and the bot reply is visible in the tail", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", herdrBot: { id: "reviewer" } });
    const events: unknown[] = [];
    h.host.events.on("transcript", (payload) => events.push(payload));
    const result = await h.call("sendPrompt", { agentId: "reviewer", prompt: "hello", clientNonce: "n-1", attachmentPaths: ["/tmp/a.txt"], attachmentNames: ["a.txt"] });
    assert.equal(result.accepted, true);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const tail = await h.call("openAgentTail", { id: "reviewer", limit: 50 });
    assert.equal(tail.entries[0].clientNonce, "n-1");
    assert.match(tail.entries[0].content, /\(attached: \/tmp\/a.txt\)/);
    assert.equal(tail.entries.at(-1).message.content, "hi from reviewer");
    assert.ok(events.some((e) => (e as { type: string }).type === "appended"));
    const window = await h.call("getAgentTranscriptWindow", { id: "reviewer", limit: 10 });
    assert.deepEqual(window.threadCounts, {});
    await h.call("reactToMessage", { agentId: "reviewer", entryId: tail.entries[0].id, emoji: "👍" });
    assert.deepEqual((await h.call("getAgentTranscriptTail", { id: "reviewer", limit: 1, beforeSeq: 2 })).entries[0].reactions, [{ emoji: "👍", by: "me" }]);
  } finally {
    await h.cleanup();
  }
});

test("stubs and unknown methods behave as the renderer expects", async () => {
  const h = await harness();
  try {
    assert.deepEqual(await h.call("getAsyncTasks", { id: "x" }), []);
    assert.equal(await h.call("getForeverBoxStatus", { id: "x" }), null);
    assert.equal(await h.call("isGlobalSearchEnabled"), false);
    assert.equal((await h.call("getSharingState")).isEnabled, false);
    const unknown = await h.dispatch("definitelyNotAMethod", {});
    assert.equal(unknown.status, "failed");
    assert.equal(unknown.status === "failed" && unknown.failure.code, "unknown-method");
    const invalid = await h.dispatch("sendPrompt", { agentId: 42 });
    assert.equal(invalid.status === "failed" && invalid.failure.code, "invalid-args");
    const duplicate = await h.dispatch("duplicateAgent", { id: "reviewer" });
    assert.equal(duplicate.status === "failed" && duplicate.failure.code, "unsupported");
  } finally {
    await h.cleanup();
  }
});

test("openAgentTail no longer marks a chat as read; herdrBot.markChatRead is the only way to acknowledge", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", herdrBot: { id: "reviewer" } });
    await h.call("sendPrompt", { agentId: "reviewer", prompt: "hello" });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const before = (await h.call("listAgents")).find((a: { id: string }) => a.id === "reviewer");
    assert.equal(before.hasUnread, true);

    // Loading (or preloading) the tail is read-only: it must not itself acknowledge anything.
    await h.call("openAgentTail", { id: "reviewer", limit: 50 });
    const afterTail = (await h.call("listAgents")).find((a: { id: string }) => a.id === "reviewer");
    assert.equal(afterTail.hasUnread, true);

    // An ACK below the latest seq leaves the chat unread.
    const partial = await h.call("herdrBot.markChatRead", { id: "reviewer", throughSeq: 1 });
    assert.equal(partial.lastReadSeq, 1);
    assert.equal((await h.call("listAgents")).find((a: { id: string }) => a.id === "reviewer").hasUnread, true);

    // ACKing through the actual latest seq clears unread.
    const latestSeq = before.lastIncomingSeq as number;
    const full = await h.call("herdrBot.markChatRead", { id: "reviewer", throughSeq: latestSeq });
    assert.equal(full.lastReadSeq, latestSeq);
    assert.equal((await h.call("listAgents")).find((a: { id: string }) => a.id === "reviewer").hasUnread, false);

    const invalid = await h.dispatch("herdrBot.markChatRead", { id: "reviewer", throughSeq: -1 });
    assert.equal(invalid.status === "failed" && invalid.failure.code, "invalid-args");
  } finally {
    await h.cleanup();
  }
});

test("herdrBot.quickCreateBot reserves instantly and herdrBot.retryBotSetup reuses the same profile", async () => {
  const temp = makeTempHome();
  const requestId = "33333333-3333-3333-3333-333333333333";
  const id = `bot-${requestId}`;
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [], onPrompt: { [id]: { say: [greetingText("en")], sayOnce: true } } });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null, ensureSession: null });
  await host.start();
  const dispatch = createCoordinatorDispatcher(host);
  try {
    const created = await dispatch("herdrBot.quickCreateBot", { requestId, locale: "en" });
    assert.equal(created.status, "ok");
    const agent = (created as { status: "ok"; value: { agent: { id: string; herdrBot: { onboarding: { stage: string } } } } }).value.agent;
    assert.equal(agent.id, id);
    assert.equal(agent.herdrBot.onboarding.stage, "provisioning");

    const bad = await dispatch("herdrBot.quickCreateBot", { requestId: "not-a-uuid", locale: "en" });
    assert.equal(bad.status === "failed" && bad.failure.code, "invalid-args");

    await host.onboarding.settled(id);
    assert.equal(host.chat.summary(id)?.herdrBot?.onboarding?.stage, "ready");

    // retrying a bot that already reached ready is a guarded error -- it must not re-provision.
    const briefsBefore = (fake.readState().prompts ?? []).length;
    const retryReady = await dispatch("herdrBot.retryBotSetup", { id });
    assert.equal(retryReady.status === "failed" && retryReady.failure.code, "bot_not_ready");
    assert.equal(host.chat.summary(id)?.herdrBot?.onboarding?.stage, "ready");
    assert.equal((fake.readState().prompts ?? []).length, briefsBefore, "a guarded retry must not send another brief/greeting");
    assert.equal(host.chat.listSummaries().filter((s) => s.id === id).length, 1);
  } finally {
    await host.stop();
    temp.cleanup();
  }
});

test("herdrBot.quickCreateBot names the reserved bot from `name` when given, else a plain locale default", async () => {
  const temp = makeTempHome();
  const untitledId = "44444444-4444-4444-4444-444444444444";
  const namedId = "55555555-5555-5555-5555-555555555555";
  const untitledBotId = `bot-${untitledId}`;
  const namedBotId = `bot-${namedId}`;
  const fake = installFakeHerdr(temp.home, {
    agents: [],
    workspaces: [],
    onPrompt: { [untitledBotId]: { say: [greetingText("ko")], sayOnce: true }, [namedBotId]: { say: [greetingText("ko")], sayOnce: true } },
  });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null, ensureSession: null });
  await host.start();
  const dispatch = createCoordinatorDispatcher(host);
  try {
    // No name (the "+" combobox's plain "Create a new Bot" row) -> the untitled locale default,
    // with no id-derived suffix.
    const untitled = await dispatch("herdrBot.quickCreateBot", { requestId: untitledId, locale: "ko" });
    assert.equal(untitled.status, "ok");
    assert.equal((untitled as { status: "ok"; value: { agent: { name: string } } }).value.agent.name, "새 Bot");

    // A name typed before picking `이름이 "..."인 Bot 만들기` -> that exact name.
    const named = await dispatch("herdrBot.quickCreateBot", { requestId: namedId, locale: "ko", name: "코드 리뷰어" });
    assert.equal(named.status, "ok");
    assert.equal((named as { status: "ok"; value: { agent: { name: string } } }).value.agent.name, "코드 리뷰어");

    // Let both reservations finish provisioning before the harness tears down its temp home --
    // otherwise the background provision outlives cleanup and logs a spurious ENOENT.
    await host.onboarding.settled(untitledBotId);
    await host.onboarding.settled(namedBotId);
  } finally {
    await host.stop();
    temp.cleanup();
  }
});

test("herdrBot.defaults surfaces the host's default cwd/kind for the New Bot dialog", async () => {
  const h = await harness();
  try {
    assert.deepEqual(await h.call("herdrBot.defaults"), { cwd: "/tmp/repo", kind: "claude" });
  } finally {
    await h.cleanup();
  }
});

test("herdrBot.listDirectories resolves relative to the coordinator, for the working-directory autocomplete", async () => {
  const h = await harness();
  try {
    const { mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(join(h.temp.home, "sub-a"));
    mkdirSync(join(h.temp.home, "sub-b"));
    const listing = await h.call("herdrBot.listDirectories", { path: `${h.temp.home}/sub-` });
    assert.equal(listing.exists, false);
    assert.deepEqual(listing.entries, [join(h.temp.home, "sub-a"), join(h.temp.home, "sub-b")]);
  } finally {
    await h.cleanup();
  }
});

test("herdrBot.listModels forwards kind to the model catalog and returns its ModelCatalogResult", async () => {
  const h = await harness();
  try {
    // "claude" never spawns a process (see model-catalog.test.ts): a safe kind to exercise the wiring
    // itself against the real listBotModels, without this dispatcher test depending on a provider CLI.
    const result = await h.call("herdrBot.listModels", { kind: "claude" });
    assert.equal(result.source, "latest-alias");
    assert.deepEqual(result.models.map((m: { id: string }) => m.id), ["opus", "sonnet", "haiku"]);
  } finally {
    await h.cleanup();
  }
});
