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
import { greetingText, reservedBotId } from "../src/bots/onboarding.ts";
import { ASK_MULTI_QUESTION_SCREEN, ASK_MULTI_SELECT_SCREEN, ASK_SINGLE_SCREEN, BASH_PERMISSION_SCREEN } from "./helpers/prompt-screens.ts";
import { PromptError } from "../src/services/prompt-service.ts";

/** Narrows a "prompt" transcript entry's loosely-typed fields for the restart-recovery tests below. */
function filterPromptEntries(entries: readonly { kind: string }[]): { status: string; prompt: { question: string; signature: string } }[] {
  return entries.filter((e): e is { kind: string; status: string; prompt: { question: string; signature: string } } => e.kind === "prompt") as { status: string; prompt: { question: string; signature: string } }[];
}

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

// herdr-bot: the avatar editor (renderer avatar-editor/controller.ts) sends avatarShape/avatarColor
// at the top level of updateAgent's args, not inside `profile` -- regression for a bug where the
// dispatcher only ever read `profile`, so every colour pick silently no-op'd server-side and the next
// roster push (which reads the untouched profile) reverted the UI back to the original colour.
test("updateAgent persists top-level avatarShape/avatarColor, and \"\" resets them to null", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const recolored = await h.call("updateAgent", { id: "reviewer", avatarShape: "cloud", avatarColor: "black" });
    assert.equal(recolored.avatarShape, "cloud");
    assert.equal(recolored.avatarColor, "black");
    assert.equal((await h.call("listAgents")).find((a: { id: string }) => a.id === "reviewer").avatarColor, "black", "the pick must be readable back from a fresh roster listing, not just the write's own response");

    const recoloredAgain = await h.call("updateAgent", { id: "reviewer", avatarColor: "red" });
    assert.equal(recoloredAgain.avatarColor, "red");
    assert.equal(recoloredAgain.avatarShape, "cloud", "a colour-only patch must not clear a previously set shape");

    const reset = await h.call("updateAgent", { id: "reviewer", avatarShape: "", avatarColor: "" });
    assert.equal(reset.avatarShape, null);
    assert.equal(reset.avatarColor, null);
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
  const id = reservedBotId(requestId);
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
  const untitledBotId = reservedBotId(untitledId);
  const namedBotId = reservedBotId(namedId);
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

test("herdrBot.quickCreateBot passes avatarColor through to the reserved profile's summary", async () => {
  const temp = makeTempHome();
  const requestId = "66666666-6666-6666-6666-666666666666";
  const id = reservedBotId(requestId);
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [], onPrompt: { [id]: { say: [greetingText("ko")], sayOnce: true } } });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null, ensureSession: null });
  await host.start();
  const dispatch = createCoordinatorDispatcher(host);
  try {
    const created = await dispatch("herdrBot.quickCreateBot", { requestId, locale: "ko", avatarColor: "blue" });
    assert.equal(created.status, "ok");
    assert.equal((created as { status: "ok"; value: { agent: { avatarColor: string | null } } }).value.agent.avatarColor, "blue");
    await host.onboarding.settled(id);
    assert.equal(host.chat.summary(id)?.avatarColor, "blue");
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

test("herdrBot.answerPrompt presses the blocked form's keys through herdr and refuses stale or impossible answers", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const state = h.fake.readState();
    const pane = state.agents.find((a) => a.name === "reviewer")!;
    h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: ASK_SINGLE_SCREEN } });
    await h.host.mirror.refresh();
    const listed = (await h.call("listAgents")).find((a: { id: string }) => a.id === "reviewer");
    const prompt = listed.herdrBot.prompt;
    assert.equal(prompt.kind, "question");
    assert.deepEqual(prompt.options.map((o: { key: string }) => o.key), ["1", "2", "3", "4"]);
    assert.equal(prompt.freeTextKey, "4");

    const answered = await h.call("herdrBot.answerPrompt", { id: "reviewer", signature: prompt.signature, action: "option", key: "2" });
    assert.equal(answered.id, "reviewer", "returns the fresh summary");
    assert.deepEqual(h.fake.readLog().filter((argv) => argv[1] === "send-keys").at(-1), ["agent", "send-keys", "reviewer", "2"]);

    await h.call("herdrBot.answerPrompt", { id: "reviewer", signature: prompt.signature, action: "text", text: "todo\nlist.md" });
    const typed = h.fake.readLog().filter((argv) => argv[1] === "send-keys" || argv[1] === "send-text").slice(-3);
    assert.deepEqual(typed, [["agent", "send-keys", "reviewer", "4"], ["pane", "send-text", pane.pane_id, "todo list.md"], ["agent", "send-keys", "reviewer", "enter"]]);

    await h.call("herdrBot.answerPrompt", { id: "reviewer", signature: prompt.signature, action: "cancel" });
    assert.deepEqual(h.fake.readLog().filter((argv) => argv[1] === "send-keys").at(-1), ["agent", "send-keys", "reviewer", "esc"]);

    const stale = await h.dispatch("herdrBot.answerPrompt", { id: "reviewer", signature: "other", action: "option", key: "1" });
    assert.equal(stale.status === "failed" && stale.failure.code, "prompt_changed");
    const missing = await h.dispatch("herdrBot.answerPrompt", { id: "reviewer", signature: prompt.signature, action: "option", key: "9" });
    assert.equal(missing.status === "failed" && missing.failure.code, "invalid_answer");
    const next = await h.dispatch("herdrBot.answerPrompt", { id: "reviewer", signature: prompt.signature, action: "next" });
    assert.equal(next.status === "failed" && next.failure.code, "invalid_answer", "Next is only for multi-select questions");
    const badAction = await h.dispatch("herdrBot.answerPrompt", { id: "reviewer", signature: prompt.signature, action: "shout" });
    assert.equal(badAction.status === "failed" && badAction.failure.code, "invalid-args");

    // The pane moved on (the mirror is stale): the live re-check refuses, and nothing is typed into the prompt box.
    const keysBefore = h.fake.readLog().filter((argv) => argv[1] === "send-keys").length;
    const now = h.fake.readState();
    h.fake.writeState({ ...now, agents: now.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "idle" } : a)) });
    const unblocked = await h.dispatch("herdrBot.answerPrompt", { id: "reviewer", signature: prompt.signature, action: "option", key: "1" });
    assert.equal(unblocked.status === "failed" && unblocked.failure.code, "not_blocked");
    assert.equal(h.fake.readLog().filter((argv) => argv[1] === "send-keys").length, keysBefore);
    await h.host.mirror.refresh();
    assert.equal((await h.call("listAgents")).find((a: { id: string }) => a.id === "reviewer").herdrBot.prompt, null);
  } finally {
    await h.cleanup();
  }
});

test("herdrBot.answerPrompt moves a multi-select question on with Tab", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const state = h.fake.readState();
    h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: ASK_MULTI_SELECT_SCREEN } });
    await h.host.mirror.refresh();
    const prompt = (await h.call("listAgents")).find((a: { id: string }) => a.id === "reviewer").herdrBot.prompt;
    assert.equal(prompt.multiSelect, true);
    await h.call("herdrBot.answerPrompt", { id: "reviewer", signature: prompt.signature, action: "next" });
    assert.deepEqual(h.fake.readLog().filter((argv) => argv[1] === "send-keys").at(-1), ["agent", "send-keys", "reviewer", "tab"]);
  } finally {
    await h.cleanup();
  }
});

test("a blocked prompt becomes an inline transcript card: pending -> answered from the card, or resolved when the pane moves on by itself", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const block = (screen: string) => {
      const state = h.fake.readState();
      h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: screen } });
    };
    const unblock = () => {
      const state = h.fake.readState();
      h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "idle" } : a)) });
    };
    const promptEntries = async () => (await h.call("openAgentTail", { id: "reviewer" })).entries.filter((e: { kind: string }) => e.kind === "prompt");

    block(ASK_SINGLE_SCREEN);
    await h.host.mirror.refresh();
    let entries = await promptEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, "pending");
    assert.equal(entries[0].prompt.question, "Which color do you prefer?");
    assert.deepEqual(entries[0].author, { id: "reviewer", name: "Reviewer" });

    await h.call("herdrBot.answerPrompt", { id: "reviewer", signature: entries[0].prompt.signature, action: "option", key: "2" });
    entries = await promptEntries();
    assert.equal(entries[0].status, "answered");
    assert.deepEqual(entries[0].answer, { kind: "option", key: "2", label: "Green" });

    unblock();
    await h.host.mirror.refresh();
    entries = await promptEntries();
    assert.equal(entries.length, 1, "no new card once the pane moved on");
    assert.equal(entries[0].status, "answered", "an in-app answer is not downgraded to resolved");

    // Answered in the terminal instead: the card is resolved without an answer.
    block(BASH_PERMISSION_SCREEN);
    await h.host.mirror.refresh();
    entries = await promptEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries[1].prompt.kind, "permission");
    unblock();
    await h.host.mirror.refresh();
    entries = await promptEntries();
    assert.equal(entries[1].status, "resolved");
    assert.equal(entries[1].answer, undefined);

    // The next question of the same form is a new card; the previous one resolves.
    block(ASK_MULTI_QUESTION_SCREEN);
    await h.host.mirror.refresh();
    block(ASK_MULTI_SELECT_SCREEN);
    await h.host.mirror.refresh();
    entries = await promptEntries();
    assert.equal(entries.length, 4);
    assert.equal(entries[2].status, "resolved");
    assert.equal(entries[3].status, "pending");
    assert.equal(entries[3].prompt.multiSelect, true);
  } finally {
    await h.cleanup();
  }
});

test("a prompt raised during a room turn is filed in the room, not the bot's DM", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const group = await h.call("createGroup", { name: "Auth", description: "", memberIds: ["reviewer"] });
    const state = h.fake.readState();
    h.fake.writeState({ ...state, onPrompt: { reviewer: { finalStatus: "blocked" } }, screens: { reviewer: BASH_PERMISSION_SCREEN } });
    await h.call("sendPrompt", { agentId: group.agent.id, prompt: "clean up the temp dir" });
    const roomPrompts = async () => (await h.call("openAgentTail", { id: group.agent.id })).entries.filter((e: { kind: string }) => e.kind === "prompt");
    for (let i = 0; i < 40 && (await roomPrompts()).length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    const entries = await roomPrompts();
    assert.equal(entries.length, 1, "the card belongs to the room whose turn raised it");
    assert.equal(entries[0].status, "pending");
    assert.equal(entries[0].prompt.kind, "permission");
    const dmPrompts = (await h.call("openAgentTail", { id: "reviewer" })).entries.filter((e: { kind: string }) => e.kind === "prompt");
    assert.equal(dmPrompts.length, 0, "and not duplicated into the DM");
  } finally {
    await h.cleanup();
  }
});

test("a host restart resumes -- does not duplicate -- a card whose pane is still blocked on the same form", async () => {
  const h = await harness();
  const secondHost = createHost(resolveConfig({ HERDR_BOT_HOME: h.temp.home, HERDR_BIN_PATH: h.fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" }), { cli: createHerdrCli(h.fake.binPath, h.fake.env), socketPath: null, ensureSession: null });
  let secondStarted = false;
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const state = h.fake.readState();
    h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: ASK_SINGLE_SCREEN } });
    await h.host.mirror.refresh();
    assert.equal((await h.call("openAgentTail", { id: "reviewer" })).entries.filter((e: { kind: string }) => e.kind === "prompt")[0]?.status, "pending");
    await h.host.stop();

    // The pane is still blocked on the exact same form when the host comes back: one live card, not
    // a "터미널에서 답변됨" ghost stacked above a second, freshly-appended one.
    await secondHost.start();
    secondStarted = true;
    const entries = filterPromptEntries(secondHost.chat.tail("reviewer", 50).entries);
    assert.equal(entries.length, 1, "no duplicate card for the still-blocked form");
    assert.equal(entries[0]?.status, "pending");
    assert.equal(entries[0]?.prompt.question, "Which color do you prefer?");

    // It is still the live, answerable card, not an orphan: answering it goes through and settles.
    const answered = await secondHost.prompts.answer("reviewer", entries[0]!.prompt.signature, { action: "option", key: "2" });
    assert.equal(answered, undefined);
  } finally {
    if (secondStarted) await secondHost.stop();
    h.temp.cleanup();
  }
});

test("a host restart resolves a card the pane moved past while the app was closed, without leaving it answerable", async () => {
  const h = await harness();
  const secondHost = createHost(resolveConfig({ HERDR_BOT_HOME: h.temp.home, HERDR_BIN_PATH: h.fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" }), { cli: createHerdrCli(h.fake.binPath, h.fake.env), socketPath: null, ensureSession: null });
  let secondStarted = false;
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const state = h.fake.readState();
    h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: ASK_SINGLE_SCREEN } });
    await h.host.mirror.refresh();
    await h.host.stop();

    // The user answered it directly in herdr while the app was closed: the pane is idle again by the
    // time the new run starts.
    const idled = h.fake.readState();
    h.fake.writeState({ ...idled, agents: idled.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "idle" } : a)) });
    await secondHost.start();
    secondStarted = true;
    const entries = filterPromptEntries(secondHost.chat.tail("reviewer", 50).entries);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.status, "resolved");
    await assert.rejects(secondHost.prompts.answer("reviewer", entries[0]!.prompt.signature, { action: "option", key: "2" }), (error: unknown) => error instanceof PromptError && error.code === "not_blocked");
  } finally {
    if (secondStarted) await secondHost.stop();
    h.temp.cleanup();
  }
});

test("a host restart hides the ghost cards an earlier (buggy) run stacked above a still-live card for the same form", async () => {
  const h = await harness();
  const secondHost = createHost(resolveConfig({ HERDR_BOT_HOME: h.temp.home, HERDR_BIN_PATH: h.fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" }), { cli: createHerdrCli(h.fake.binPath, h.fake.env), socketPath: null, ensureSession: null });
  let secondStarted = false;
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const state = h.fake.readState();
    h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: ASK_SINGLE_SCREEN } });
    await h.host.mirror.refresh();
    // What the old restart logic left behind: the first card force-resolved ("터미널에서 답변됨") and a
    // second, identical card appended right after it -- twice, for two restarts.
    const first = filterPromptEntries(h.host.chat.tail("reviewer", 50).entries)[0]!;
    h.host.chat.updateEntry("reviewer", (first as unknown as { id: string }).id, (entry) => ({ ...entry, status: "resolved" }));
    const second = h.host.chat.appendPrompt("reviewer", { id: "reviewer", name: "Reviewer" }, h.host.mirror.get("reviewer").prompt!);
    h.host.chat.updateEntry("reviewer", second.id, (entry) => ({ ...entry, status: "resolved" }));
    h.host.chat.appendPrompt("reviewer", { id: "reviewer", name: "Reviewer" }, h.host.mirror.get("reviewer").prompt!);
    await h.host.stop();

    await secondHost.start();
    secondStarted = true;
    const entries = filterPromptEntries(secondHost.chat.tail("reviewer", 50).entries);
    assert.deepEqual(entries.map((e) => e.status), ["superseded", "superseded", "pending"], "ghosts are hidden, the last card stays live");
    await secondHost.prompts.answer("reviewer", entries[2]!.prompt.signature, { action: "option", key: "2" });
  } finally {
    if (secondStarted) await secondHost.stop();
    h.temp.cleanup();
  }
});

test("a resolved card followed by a different question is history, not a ghost, and stays visible", async () => {
  const h = await harness();
  const secondHost = createHost(resolveConfig({ HERDR_BOT_HOME: h.temp.home, HERDR_BIN_PATH: h.fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" }), { cli: createHerdrCli(h.fake.binPath, h.fake.env), socketPath: null, ensureSession: null });
  let secondStarted = false;
  try {
    await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    const block = (screen: string) => {
      const state = h.fake.readState();
      h.fake.writeState({ ...state, agents: state.agents.map((a) => (a.name === "reviewer" ? { ...a, agent_status: "blocked" } : a)), screens: { reviewer: screen } });
    };
    block(BASH_PERMISSION_SCREEN);
    await h.host.mirror.refresh();
    block(ASK_SINGLE_SCREEN);
    await h.host.mirror.refresh();
    await h.host.stop();

    await secondHost.start();
    secondStarted = true;
    const entries = filterPromptEntries(secondHost.chat.tail("reviewer", 50).entries);
    assert.deepEqual(entries.map((e) => e.status), ["resolved", "pending"]);
  } finally {
    if (secondStarted) await secondHost.stop();
    h.temp.cleanup();
  }
});
