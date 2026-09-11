import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { createCoordinatorDispatcher } from "../src/coordinator/dispatcher.ts";
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
