import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { createCoordinatorDispatcher } from "../src/coordinator/dispatcher.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

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
