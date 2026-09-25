import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig, type HostConfig } from "../src/config.ts";
import { createHerdrCli, type HerdrCli } from "../src/herdr/cli.ts";
import { ControlError } from "../src/control/protocol.ts";
import { greetingText, reservedBotId } from "../src/bots/onboarding.ts";
import { RosterError } from "../src/services/roster-service.ts";
import { entryText } from "../src/model/entries.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { waitFor } from "./helpers/wait-for.ts";

const REQ = "11111111-1111-1111-1111-111111111111";
const ID = reservedBotId(REQ);
const GREETING = greetingText("ko");

function greetingScript(say: string[] = [GREETING]): FakeHerdrState {
  return { agents: [], workspaces: [], onPrompt: { [ID]: { say, sayOnce: true } } };
}

async function harness(opts: { state?: FakeHerdrState; wrapCli?: (base: HerdrCli) => HerdrCli } = {}) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, opts.state ?? greetingScript());
  const config: HostConfig = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const base = createHerdrCli(fake.binPath, fake.env);
  const cli = opts.wrapCli ? opts.wrapCli(base) : base;
  const host = createHost(config, { cli, socketPath: null, ensureSession: null });
  await host.start();
  const stage = () => host.chat.summary(ID)?.herdrBot?.onboarding?.stage ?? null;
  const greetings = () => host.chat.transcript(ID).readAll().filter((e) => e.origin === "onboarding");
  return { temp, fake, host, config, stage, greetings, cleanup: async () => { await host.stop(); temp.cleanup(); } };
}

test("quickCreate saves and returns the reserved profile before the spawn completes, then reaches ready", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let starts = 0;
  const h = await harness({ wrapCli: (base) => ({ ...base, async agentStart(args) { starts += 1; await gate; return base.agentStart(args); } }) });
  try {
    const reserved = h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    // Responded with the reserved profile while agentStart is still blocked on the gate.
    assert.equal(reserved.onboarding?.stage, "provisioning");
    assert.equal(reserved.herdr.paneId, null);
    assert.equal(h.stage(), "provisioning");
    release();
    await h.host.onboarding.settled(ID);
    assert.equal(h.stage(), "ready");
    assert.equal(starts, 1);
    assert.equal(h.greetings().length, 1);
    assert.equal(entryText(h.greetings()[0]!), GREETING);
  } finally {
    await h.cleanup();
  }
});

test("the same request UUID (double-click / retry) makes one profile and spawns once", async () => {
  let starts = 0;
  const h = await harness({ wrapCli: (base) => ({ ...base, async agentStart(args) { starts += 1; return base.agentStart(args); } }) });
  try {
    const a = h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    const b = h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    assert.equal(a.id, b.id);
    await h.host.onboarding.settled(ID);
    assert.equal(starts, 1);
    assert.equal(h.host.chat.listSummaries().filter((s) => s.id === ID).length, 1);
    assert.equal(h.stage(), "ready");
  } finally {
    await h.cleanup();
  }
});

test("retry only runs on a failed, not-in-flight bot; a ready bot is a guarded error", async () => {
  const h = await harness();
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    await h.host.onboarding.settled(ID);
    assert.equal(h.stage(), "ready");
    // A retry on a ready bot must be refused, never re-provisioned.
    assert.throws(() => h.host.onboarding.retry(ID), (e: unknown) => e instanceof RosterError && e.code === "bot_not_ready");
    assert.equal(h.stage(), "ready");
    assert.equal(h.greetings().length, 1);

    // Force it to a failed state, then retry: it must re-provision back to ready with one greeting.
    const profiles = new ProfileStore(h.config.home);
    const failed = profiles.get(ID)!;
    profiles.save({ ...failed, onboarding: { ...failed.onboarding!, stage: "failed", error: "boom" } });
    const retried = h.host.onboarding.retry(ID);
    assert.equal(retried.onboarding?.stage, "provisioning");
    await h.host.onboarding.settled(ID);
    assert.equal(h.stage(), "ready");
    assert.equal(h.greetings().length, 1);
  } finally {
    await h.cleanup();
  }
});

test("a successful onboarding stores exactly one greeting and never a user message", async () => {
  const h = await harness();
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    await h.host.onboarding.settled(ID);
    const entries = h.host.chat.transcript(ID).readAll();
    assert.equal(entries.filter((e) => e.kind === "message").length, 0);
    assert.equal(h.greetings().length, 1);
    assert.equal(h.greetings()[0]!.origin, "onboarding");
    assert.equal(h.greetings()[0]!.onboardingKey, REQ);
    assert.equal(h.stage(), "ready");
  } finally {
    await h.cleanup();
  }
});

test("onboarding writes the app-owned greeting without prompting the terminal agent", async () => {
  const h = await harness();
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    await h.host.onboarding.settled(ID);
    assert.equal(h.stage(), "ready");
    const prompts = (h.fake.readState().prompts ?? []).filter((p) => p.target === ID);
    assert.equal(prompts.length, 0, "the deterministic greeting must not depend on an agent accepting pasted instructions");
  } finally {
    await h.cleanup();
  }
});

test("onboarding stores the canonical localized greeting regardless of agent prompt behavior", async () => {
  const accept = await harness({ state: { agents: [], workspaces: [], onPrompt: { [ID]: { say: ["unexpected"], finalStatus: "blocked" } } } });
  try {
    accept.host.onboarding.create({ requestId: REQ, locale: "en" });
    await accept.host.onboarding.settled(ID);
    assert.equal(accept.stage(), "ready");
    assert.equal(accept.greetings().length, 1);
    assert.equal(entryText(accept.greetings()[0]!), greetingText("en"));
    assert.equal((accept.fake.readState().prompts ?? []).filter((p) => p.target === ID).length, 0);
  } finally {
    await accept.cleanup();
  }
});

test("a greeting said twice during setup is idempotent (one entry)", async () => {
  const h = await harness({ state: greetingScript([GREETING, GREETING]) });
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    await h.host.onboarding.settled(ID);
    assert.equal(h.greetings().length, 1);
    assert.equal(h.stage(), "ready");
  } finally {
    await h.cleanup();
  }
});

test("restart recovers to ready when the greeting is stored, and to failed when it is not", async () => {
  const h = await harness();
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    await h.host.onboarding.settled(ID);
    const profiles = new ProfileStore(h.config.home);
    // Simulate a crash after the greeting landed but before the stage flipped to ready.
    const crashed = profiles.get(ID)!;
    profiles.save({ ...crashed, onboarding: { ...crashed.onboarding!, stage: "greeting" } });
    // And a second bot that crashed before any greeting.
    const otherId = "bot-22222222-2222-2222-2222-222222222222";
    profiles.save({ ...crashed, id: otherId, herdr: { paneId: null, workspaceId: null, sessionId: null }, onboarding: { requestId: "22222222-2222-2222-2222-222222222222", locale: "en", stage: "briefing", error: null } });

    const recovered = createHost(h.config, { cli: createHerdrCli(h.fake.binPath, h.fake.env), socketPath: null, ensureSession: null });
    recovered.onboarding.recover();
    assert.equal(recovered.chat.summary(ID)?.herdrBot?.onboarding?.stage, "ready");
    assert.equal(recovered.chat.transcript(ID).readAll().filter((e) => e.origin === "onboarding").length, 1);
    assert.equal(recovered.chat.summary(otherId)?.herdrBot?.onboarding?.stage, "failed");
  } finally {
    await h.cleanup();
  }
});

test("an avatarColor picked before the first bot exists persists on the reserved profile and its summary", async () => {
  const h = await harness();
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko", avatarColor: "blue" });
    assert.equal(h.host.chat.summary(ID)?.avatarColor, "blue");
    await h.host.onboarding.settled(ID);
    assert.equal(h.host.chat.summary(ID)?.avatarColor, "blue");
  } finally {
    await h.cleanup();
  }
});

test("quick create assigns an avatar color when none is specified", async () => {
  const h = await harness();
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    assert.match(h.host.chat.summary(ID)?.avatarColor ?? "", /^(brown|red|orange|yellow|green|cyan|blue|violet|magenta|gray)$/);
  } finally {
    await h.cleanup();
  }
});

test("a bot still in setup may only greet its own DM", async () => {
  const h = await harness();
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    await h.host.onboarding.settled(ID);
    const profiles = new ProfileStore(h.config.home);
    const ready = profiles.get(ID)!;
    profiles.save({ ...ready, onboarding: { ...ready.onboarding!, stage: "greeting" } });
    const paneId = ready.herdr.paneId!;
    assert.throws(() => h.host.turns.handleSay(paneId, "someone-else", GREETING), (e: unknown) => e instanceof ControlError && e.code === "not_a_member");
  } finally {
    await h.cleanup();
  }
});

test("deleting a bot mid-provision does not resurrect it once the async spawn returns", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const h = await harness({ wrapCli: (base) => ({ ...base, async agentStart(args) { await gate; return base.agentStart(args); } }) });
  try {
    h.host.onboarding.create({ requestId: REQ, locale: "ko" });
    // Wait until provisioning has created + persisted the pane and is blocked on the gated agentStart
    // (its paneId is now on the profile) -- the actual race we want to exercise, not a fixed sleep.
    await waitFor(() => h.host.chat.summary(ID)?.herdrBot?.paneId != null, { message: "reserved pane was never persisted" });
    await h.host.roster.deleteBot(ID);
    release();
    await h.host.onboarding.settled(ID);
    assert.equal(h.host.chat.summary(ID), null);
    assert.equal(h.host.chat.listSummaries().some((s) => s.id === ID), false);
  } finally {
    await h.cleanup();
  }
});
