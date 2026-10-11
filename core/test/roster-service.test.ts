import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli, type HerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { setLogSink } from "../src/log.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { RoomStore } from "../src/store/room-store.ts";
import { RosterError, RosterService } from "../src/services/roster-service.ts";
import { HerdrError } from "../src/herdr/types.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile } from "./helpers/fixtures.ts";
import type { BotSystemEvent } from "../src/model/bot-system-events.ts";
import { AVATAR_COLORS } from "../src/model/avatar-colors.ts";

function harness(state: FakeHerdrState = { agents: [], workspaces: [] }) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  const notices: string[] = [];
  const botEvents: Array<{ chatId: string; event: BotSystemEvent }> = [];
  const service = new RosterService({
    config, profiles, rooms, cli, mirror, now: () => 1_000,
    onNotice: (chatId, text) => notices.push(`${chatId}: ${text}`),
    onBotEvent: (chatId, event) => botEvents.push({ chatId, event }),
  });
  // Routes teardown through RosterService#stop (mirrors host.stop()) so a background identity brief
  // from createBot can never still be writing into `temp.home` when rmSync runs.
  return { temp, fake, config, profiles, rooms, cli, mirror, service, notices, botEvents, cleanup: async () => { await service.stop(); temp.cleanup(); } };
}

/** A harness with no `HERDR_BOT_DEFAULT_CWD` env override, so
 * effectiveDefaultCwd falls through to the persisted app-settings default and the MRU bot cwd --
 * `harness()` above always has the env override win, by design (see effectiveDefaultCwd's doc). */
function harnessNoEnvCwd(state: FakeHerdrState = { agents: [], workspaces: [] }) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  let clock = 1_000;
  const service = new RosterService({ config, profiles, rooms, cli, mirror, now: () => (clock += 1) });
  return { temp, fake, config, profiles, rooms, cli, mirror, service, cleanup: async () => { await service.stop(); temp.cleanup(); } };
}

test("effectiveDefaultCwd: null with nothing configured and no bot yet; then the persisted default; then the MRU non-home ready bot cwd", async () => {
  const h = harnessNoEnvCwd();
  try {
    assert.equal(h.service.effectiveDefaultCwd(), null);

    h.service.updateAppSettings({ defaultWorkingFolder: "/tmp/alpha" });
    assert.equal(h.service.effectiveDefaultCwd(), "/tmp/alpha");

    // Clearing the explicit setting falls through to the most recently updated bot's cwd.
    h.service.updateAppSettings({ defaultWorkingFolder: null });
    await h.service.createBot({ id: "older", name: "Older", cwd: "/tmp/one" });
    await h.service.createBot({ id: "newer", name: "Newer", cwd: "/tmp/two" });
    assert.equal(h.service.effectiveDefaultCwd(), "/tmp/two");
  } finally {
    await h.cleanup();
  }
});

test("effectiveDefaultCwd skips a bot parked at the home directory and a bot that never finished onboarding, even when they are the most recently updated", async () => {
  const h = harnessNoEnvCwd();
  try {
    h.profiles.save(sampleProfile({ id: "safe", cwd: "/tmp/safe", updatedAt: 1 }));
    // The home-dir bot and an unfinished-onboarding bot look like the newest updates -- both must
    // still be skipped as MRU candidates, leaving "safe" (the only valid one) as the default.
    h.profiles.save(sampleProfile({ id: "at-home", cwd: homedir(), updatedAt: 9_000_000 }));
    h.profiles.save(sampleProfile({ id: "mid", cwd: "/tmp/mid", updatedAt: 9_500_000, onboarding: { requestId: "r1", locale: "en", stage: "provisioning", error: null } }));
    assert.equal(h.service.effectiveDefaultCwd(), "/tmp/safe");
  } finally {
    await h.cleanup();
  }
});

test("env override (HERDR_BOT_DEFAULT_CWD) wins over the persisted default working folder", async () => {
  const h = harness(); // HERDR_BOT_DEFAULT_CWD=/tmp/repo
  try {
    h.service.updateAppSettings({ defaultWorkingFolder: "/tmp/other" });
    assert.equal(h.service.effectiveDefaultCwd(), "/tmp/repo");
  } finally {
    await h.cleanup();
  }
});

test("createBot rejects an unset cwd with missing_cwd when no safe default exists", async () => {
  const h = harnessNoEnvCwd();
  try {
    await assert.rejects(h.service.createBot({ id: "a", name: "A" }), (e: unknown) => e instanceof RosterError && e.code === "missing_cwd");
  } finally {
    await h.cleanup();
  }
});

test("createBot rejects a cwd that resolves to exactly the home directory unless allowHomeCwd is set", async () => {
  const h = harnessNoEnvCwd();
  try {
    await assert.rejects(h.service.createBot({ id: "a", name: "A", cwd: homedir() }), (e: unknown) => e instanceof RosterError && e.code === "home_cwd_requires_confirmation");
    const bot = await h.service.createBot({ id: "b", name: "B", cwd: homedir(), allowHomeCwd: true });
    assert.equal(bot.cwd, homedir());
  } finally {
    await h.cleanup();
  }
});

test("createBot resolves before the identity brief settles, so a CLI that never confirms the brief cannot block bot creation", async () => {
  const h = harness();
  try {
    let releaseBrief!: () => void;
    const gate = new Promise<void>((resolve) => { releaseBrief = resolve; });
    let briefCalls = 0;
    const slowCli: HerdrCli = {
      ...h.cli,
      async agentPrompt(args) {
        if (args.wait) { briefCalls += 1; await gate; }
        return h.cli.agentPrompt(args);
      },
    };
    const service = new RosterService({ config: h.config, profiles: h.profiles, rooms: h.rooms, cli: slowCli, mirror: h.mirror, now: () => 1_000 });
    const started = Date.now();
    const profile = await service.createBot({ id: "slow-cli-bot", name: "Slow" });
    assert.equal(profile.id, "slow-cli-bot");
    assert.ok(Date.now() - started < 1_000, "createBot must not wait on the identity brief");
    assert.equal(briefCalls, 1);
    releaseBrief();
    await service.briefSettled("slow-cli-bot");
  } finally {
    await h.cleanup();
  }
});

test("createBot spawns into a new workspace for a new cwd, then a tab for the next bot", async () => {
  const h = harness();
  try {
    const first = await h.service.createBot({ name: "Code Reviewer", kind: "claude", permissionMode: "ask" });
    assert.equal(first.id, "code-reviewer");
    assert.equal(first.herdr.paneId, "w1:p1");
    assert.equal(first.herdr.workspaceId, "w1");
    assert.equal(first.cwd, "/tmp/repo");
    assert.ok(AVATAR_COLORS.includes(first.avatarColor as (typeof AVATAR_COLORS)[number]));
    const second = await h.service.createBot({ id: "fixer", name: "Fixer", kind: "codex", permissionMode: "auto" });
    assert.equal(second.herdr.paneId, "w1:p100");
    const log = h.fake.readLog().map((argv) => argv.join(" "));
    assert.ok(log.some((line) => line.startsWith("workspace create --cwd /tmp/repo --label herdr-bot: repo")));
    assert.ok(log.some((line) => line.startsWith("tab create --workspace w1 --cwd /tmp/repo --label fixer")));
    assert.ok(log.some((line) => line === `agent start code-reviewer --kind claude --pane w1:p1 -- --allowedTools Bash(${h.config.cliPath} *)`));
    assert.ok(log.some((line) => line === "agent start fixer --kind codex --pane w1:p100 -- -s workspace-write -a on-request"));
    // The identity brief sends in the background after createBot resolves.
    await h.service.briefSettled("code-reviewer");
    const brief = h.fake.readState().prompts?.find((p) => p.target === "code-reviewer");
    assert.match(brief?.text ?? "", /You are "Code Reviewer"/);
    assert.equal(h.mirror.get("fixer").status, "idle");
  } finally {
    await h.cleanup();
  }
});

test("createBot persists launch selections and passes them to herdr", async () => {
  const h = harness();
  try {
    const bot = await h.service.createBot({ id: "model-bot", name: "Model bot", kind: "codex", permissionMode: "auto", model: "  gpt-5.4  ", reasoningEffort: "xhigh" });
    assert.equal(bot.model, "gpt-5.4");
    assert.equal(bot.reasoningEffort, "xhigh");
    assert.equal(h.profiles.get(bot.id)?.model, "gpt-5.4");
    assert.deepEqual(h.fake.readLog().find((argv) => argv[0] === "agent" && argv[1] === "start"), [
      "agent", "start", "model-bot", "--kind", "codex", "--pane", "w1:p1", "--", "-s", "workspace-write", "-a", "on-request", "--model", "gpt-5.4", "--config", 'model_reasoning_effort="xhigh"',
    ]);
  } finally {
    await h.cleanup();
  }
});

test("createBot rejects invalid launch selections before making a pane", async () => {
  const h = harness();
  try {
    await assert.rejects(h.service.createBot({ id: "empty", name: "Empty", model: "   " }), (error: unknown) => error instanceof RosterError && error.code === "invalid_launch_options");
    await assert.rejects(h.service.createBot({ id: "unsupported", name: "Unsupported", kind: "gemini", reasoningEffort: "high" }), (error: unknown) => error instanceof RosterError && error.code === "invalid_launch_options");
    await assert.rejects(h.service.createBot({ id: "unknown-effort", name: "Unknown effort", kind: "codex", reasoningEffort: "ultra" as never }), (error: unknown) => error instanceof RosterError && error.code === "invalid_launch_options");
    assert.equal(h.fake.readLog().some((argv) => argv[0] === "workspace" && argv[1] === "create"), false);
  } finally {
    await h.cleanup();
  }
});

test("createBot preserves an explicitly selected avatar color", async () => {
  const h = harness();
  try {
    const bot = await h.service.createBot({ id: "green-bot", name: "Green", avatarColor: "green" });
    assert.equal(bot.avatarColor, "green");
  } finally {
    await h.cleanup();
  }
});

test("provisionReservedBot spawns a reserved profile, then reuses the named agent on a repeat call", async () => {
  const h = harness();
  try {
    const id = "bot-11111111-1111-1111-1111-111111111111";
    h.profiles.save(sampleProfile({ id, name: "New bot", cwd: "/tmp/repo", herdr: { paneId: null, workspaceId: null, sessionId: null }, onboarding: { requestId: "11111111-1111-1111-1111-111111111111", locale: "en", stage: "provisioning", error: null } }));
    const first = await h.service.provisionReservedBot(id);
    assert.equal(first.status, "started");
    assert.equal(first.profile.herdr.paneId, "w1:p1");
    assert.ok(first.profile.herdr.sessionId);
    assert.equal(first.profile.onboarding?.stage, "provisioning"); // provisioning preserves the onboarding block
    const startsBefore = h.fake.readLog().filter((argv) => argv.join(" ").startsWith("agent start")).length;
    const second = await h.service.provisionReservedBot(id);
    assert.equal(second.status, "started");
    assert.equal(second.profile.herdr.paneId, "w1:p1");
    assert.equal(h.fake.readLog().filter((argv) => argv.join(" ").startsWith("agent start")).length, startsBefore);
  } finally {
    await h.cleanup();
  }
});

test("a needs_setup retry reuses the kept pane instead of creating a duplicate", async () => {
  const h = harness();
  try {
    setLogSink(() => undefined);
    const id = "bot-33333333-3333-3333-3333-333333333333";
    h.profiles.save(sampleProfile({ id, name: "New bot", cwd: "/tmp/repo", herdr: { paneId: null, workspaceId: null, sessionId: null }, onboarding: { requestId: "33333333-3333-3333-3333-333333333333", locale: "en", stage: "provisioning", error: null } }));
    let starts = 0;
    const flakyCli: HerdrCli = {
      ...h.cli,
      async agentStart(args) {
        starts += 1;
        if (starts === 1) throw new HerdrError("agent_not_ready", "finish first-run setup in the pane");
        return h.cli.agentStart(args);
      },
    };
    const service = new RosterService({ config: h.config, profiles: h.profiles, rooms: h.rooms, cli: flakyCli, mirror: h.mirror, now: () => 1_000, sleep: async () => undefined });

    const first = await service.provisionReservedBot(id);
    assert.equal(first.status, "needs_setup");
    assert.equal(first.profile.herdr.paneId, "w1:p1"); // pane kept, not closed

    // The user finishes first-run setup; a retry must start into the SAME pane, not tabCreate a new one.
    const second = await service.provisionReservedBot(id);
    assert.equal(second.status, "started");
    assert.equal(second.profile.herdr.paneId, "w1:p1");
    assert.equal(starts, 2);
    const log = h.fake.readLog().map((argv) => argv.join(" "));
    assert.equal(log.filter((line) => line.startsWith("workspace create")).length, 1, JSON.stringify(log));
    assert.equal(log.filter((line) => line.startsWith("tab create")).length, 0, JSON.stringify(log));
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await h.cleanup();
  }
});

test("a bot that is still being onboarded cannot be invited into a room", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "ready-bot", name: "Ready" });
    h.profiles.save(sampleProfile({ id: "bot-abc", name: "New bot", onboarding: { requestId: "abc", locale: "en", stage: "provisioning", error: null } }));
    assert.throws(() => h.service.createRoom({ name: "r", memberIds: ["ready-bot", "bot-abc"] }), (e: unknown) => e instanceof RosterError && e.code === "bot_not_ready");
  } finally {
    await h.cleanup();
  }
});

test("createBot rejects bad ids, duplicates, unsupported kinds", async () => {
  const h = harness();
  try {
    await assert.rejects(h.service.createBot({ id: "Bad Id", name: "x" }), (e: unknown) => e instanceof RosterError && e.code === "invalid_bot_id");
    await assert.rejects(h.service.createBot({ id: "a", name: "x", kind: "notreal" }), (e: unknown) => e instanceof RosterError && e.code === "unsupported_kind");
    await h.service.createBot({ id: "a", name: "A" });
    await assert.rejects(h.service.createBot({ id: "a", name: "A again" }), (e: unknown) => e instanceof RosterError && e.code === "bot_exists");
  } finally {
    await h.cleanup();
  }
});

test("a bot blocked during startup is saved with a setup notice", async () => {
  const h = harness({ agents: [], workspaces: [], startBlocked: ["needy"] });
  try {
    const bot = await h.service.createBot({ id: "needy", name: "Needy" });
    assert.equal(bot.id, "needy");
    assert.ok(h.notices.some((n) => n.startsWith("needy: ") && /first-run/.test(n)), JSON.stringify(h.notices));
  } finally {
    await h.cleanup();
  }
});

test("adopting a running agent renames it and marks the profile adopted; delete only clears the name", async () => {
  const h = harness({ agents: [{ name: null, agent: "grok", agent_status: "idle", pane_id: "w7:p3", tab_id: "w7:t1", workspace_id: "w7", cwd: "/work/x" }], workspaces: [] });
  try {
    const adoptable = await h.service.listAdoptable();
    assert.equal(adoptable.length, 1);
    const bot = await h.service.createBot({ id: "scout", name: "Scout", adoptPaneId: "w7:p3" });
    assert.equal(bot.adopted, true);
    assert.equal(bot.kind, "grok");
    assert.equal(bot.cwd, "/work/x");
    assert.equal(bot.model, null);
    assert.equal(bot.reasoningEffort, null);
    assert.equal(h.fake.readState().agents[0]?.name, "scout");
    assert.equal((await h.service.listAdoptable()).length, 0);
    assert.equal(h.service.resolveBotByPane("w7:p3")?.id, "scout");
    await h.service.deleteBot("scout");
    assert.equal(h.fake.readState().agents[0]?.name, null);
    assert.equal(h.fake.readState().closedPanes, undefined);
    assert.equal(h.profiles.get("scout"), null);
  } finally {
    await h.cleanup();
  }
});

test("deleting a spawned bot closes its pane and removes it from rooms", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "a", name: "A" });
    await h.service.createBot({ id: "b", name: "B" });
    // The identity brief now sends in the background after createBot resolves; wait
    // for both so their fake-herdr state writes can't race deleteBot's pane-close write below.
    await h.service.briefSettled("a");
    await h.service.briefSettled("b");
    const room = h.service.createRoom({ name: "Auth", memberIds: ["a", "b"] });
    assert.ok(room.id.startsWith("room-auth-"));
    await h.service.deleteBot("a");
    assert.deepEqual(h.fake.readState().closedPanes, ["w1:p1"]);
    assert.deepEqual(h.rooms.get(room.id)?.memberIds, ["b"]);
    assert.throws(() => h.service.setRoomMembers(room.id, ["b", "ghost"]), (e: unknown) => e instanceof RosterError && e.code === "unknown_bot");
    assert.throws(() => h.service.createRoom({ name: "big", memberIds: ["b", "b1", "b2", "b3", "b4", "b5", "b6"] }), (e: unknown) => e instanceof RosterError && e.code === "too_many_members");
  } finally {
    await h.cleanup();
  }
});

test("updateProfile and rooms round-trip", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "a", name: "A" });
    const updated = h.service.updateProfile("a", { name: "Ava", description: "helps", title: "  research, marketing  ", isHiddenFromSidebar: true });
    assert.equal(updated?.name, "Ava");
    assert.equal(updated?.isHiddenFromSidebar, true);
    // The optional "label" (shown under the bot's name) is trimmed, persisted, and clearable to "".
    assert.equal(updated?.title, "research, marketing");
    assert.equal(h.service.updateProfile("a", { title: "" })?.title, "");
    assert.equal(h.service.updateProfile("a", { isHiddenFromSidebar: true })?.title, ""); // an unrelated patch leaves it alone
    const room = h.service.createRoom({ name: "r", memberIds: ["a"] });
    assert.equal(h.service.updateRoom(room.id, { name: "renamed" })?.name, "renamed");
    h.service.deleteRoom(room.id);
    assert.equal(existsSync(`${h.temp.home}/rooms/${room.id}`), false);
    assert.deepEqual(h.service.memberIdFor("a"), { id: "a", name: "Ava", description: "helps" });
  } finally {
    await h.cleanup();
  }
});

test("updateProfile fires onBotEvent(\"bot-renamed\") only when the name actually changes", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "a", name: "A" });
    h.botEvents.length = 0;

    // A real rename fires exactly one bot-renamed event, old/new names intact.
    h.service.updateProfile("a", { name: "Ava" });
    assert.deepEqual(h.botEvents, [{ chatId: "a", event: { type: "bot-renamed", oldName: "A", newName: "Ava" } }]);

    // Resaving the identical name fires nothing.
    h.botEvents.length = 0;
    h.service.updateProfile("a", { name: "Ava" });
    assert.deepEqual(h.botEvents, []);

    // A label/description-only edit fires nothing.
    h.botEvents.length = 0;
    h.service.updateProfile("a", { description: "new bio", title: "lead" });
    assert.deepEqual(h.botEvents, []);
  } finally {
    await h.cleanup();
  }
});

test("createBot retries agentStart once when the new pane's shell is not ready yet, then succeeds", async () => {
  const h = harness();
  try {
    setLogSink(() => undefined);
    let calls = 0;
    const flakyCli: HerdrCli = {
      ...h.cli,
      async agentStart(args) {
        calls += 1;
        if (calls === 1) throw new HerdrError("herdr_error", "agent target pane w1:p1 is not an available shell");
        return h.cli.agentStart(args);
      },
    };
    const sleeps: number[] = [];
    const service = new RosterService({
      config: h.config, profiles: h.profiles, rooms: h.rooms, cli: flakyCli, mirror: h.mirror,
      now: () => 1_000, sleep: async (ms) => { sleeps.push(ms); },
    });
    const profile = await service.createBot({ id: "flaky", name: "Flaky" });
    assert.equal(profile.id, "flaky");
    assert.equal(h.profiles.get("flaky")?.id, "flaky");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [500]);
    const log = h.fake.readLog().map((argv) => argv.join(" "));
    assert.equal(log.filter((line) => line.startsWith("agent start")).length, 1, JSON.stringify(log));
    // This test's own `service` (not `h.service`) is the one whose createBot sent a background
    // identity brief -- stop it too, or that brief can still be writing when h.cleanup() tears down.
    await service.stop();
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await h.cleanup();
  }
});

test("createBot closes the spawned pane and saves no profile after 3 failed agentStart attempts", async () => {
  const h = harness();
  try {
    setLogSink(() => undefined);
    let calls = 0;
    const failingCli: HerdrCli = {
      ...h.cli,
      async agentStart() {
        calls += 1;
        throw new HerdrError("herdr_error", "boom");
      },
    };
    const notices: string[] = [];
    const failingService = new RosterService({
      config: h.config, profiles: h.profiles, rooms: h.rooms, cli: failingCli, mirror: h.mirror,
      now: () => 1_000, onNotice: (chatId, text) => notices.push(`${chatId}: ${text}`), sleep: async () => undefined,
    });
    await assert.rejects(failingService.createBot({ id: "boom", name: "Boom" }), (e: unknown) => e instanceof RosterError && e.code === "herdr_error");
    assert.equal(calls, 3);
    assert.equal(h.profiles.get("boom"), null);
    const log = h.fake.readLog().map((argv) => argv.join(" "));
    assert.ok(log.some((line) => line === "pane close w1:p1"), JSON.stringify(log));
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await h.cleanup();
  }
});

test("relaunchBot starts a new pane with the patched launch args, keeps history, and only then closes the old pane", async () => {
  const h = harness();
  try {
    const bot = await h.service.createBot({ id: "relaunch-me", name: "Relaunch Me", kind: "claude", permissionMode: "ask", cwd: "/tmp/repo" });
    await h.service.briefSettled("relaunch-me"); // else its in-flight identity brief races relaunchBot's own fake-herdr-state writes
    const oldPaneId = bot.herdr.paneId;
    const relaunched = await h.service.relaunchBot("relaunch-me", { permissionMode: "auto", model: "sonnet", reasoningEffort: "high" });
    assert.equal(relaunched.permissionMode, "auto");
    assert.equal(relaunched.model, "sonnet");
    assert.equal(relaunched.reasoningEffort, "high");
    assert.equal(relaunched.cwd, "/tmp/repo"); // unspecified -- kept
    assert.notEqual(relaunched.herdr.paneId, oldPaneId, "relaunch starts a fresh pane rather than reusing the old one");
    assert.deepEqual(h.fake.readState().closedPanes, [oldPaneId]);
    const log = h.fake.readLog().map((argv) => argv.join(" "));
    assert.ok(log.some((line) => line.includes("--model sonnet") && line.includes(`--pane ${relaunched.herdr.paneId}`)), JSON.stringify(log));
    // persisted, not just returned
    assert.equal(h.profiles.get("relaunch-me")?.permissionMode, "auto");
  } finally {
    await h.cleanup();
  }
});

test("relaunchBot updates the working directory and requires allowHomeCwd for the home directory", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "mover", name: "Mover", cwd: "/tmp/repo" });
    await h.service.briefSettled("mover");
    const moved = await h.service.relaunchBot("mover", { cwd: "/tmp/elsewhere" });
    assert.equal(moved.cwd, "/tmp/elsewhere");
    await assert.rejects(h.service.relaunchBot("mover", { cwd: homedir() }), (e: unknown) => e instanceof RosterError && e.code === "home_cwd_requires_confirmation");
    const confirmed = await h.service.relaunchBot("mover", { cwd: homedir(), allowHomeCwd: true });
    assert.equal(confirmed.cwd, homedir());
  } finally {
    await h.cleanup();
  }
});

test("relaunchBot: an explicit null clears model/reasoningEffort; an omitted field keeps the current value", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "m", name: "M", kind: "codex", model: "gpt-5.4", reasoningEffort: "high" });
    await h.service.briefSettled("m");
    const untouched = await h.service.relaunchBot("m", { permissionMode: "auto" });
    assert.equal(untouched.model, "gpt-5.4");
    assert.equal(untouched.reasoningEffort, "high");
    const cleared = await h.service.relaunchBot("m", { model: null, reasoningEffort: null });
    assert.equal(cleared.model, null);
    assert.equal(cleared.reasoningEffort, null);
  } finally {
    await h.cleanup();
  }
});

test("relaunchBot: an explicit null resets permissionMode to the host's effective default; an omitted field keeps the bot's own pinned mode", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "p", name: "P", permissionMode: "auto", cwd: "/tmp/repo" });
    await h.service.briefSettled("p");

    const untouched = await h.service.relaunchBot("p", { model: "sonnet" });
    assert.equal(untouched.permissionMode, "auto", "omitted permissionMode keeps the bot's own pinned mode");

    const resetToDefault = await h.service.relaunchBot("p", { permissionMode: null });
    assert.equal(resetToDefault.permissionMode, "ask", "explicit null falls back to effectiveDefaultPermissionMode() ('ask' with nothing configured)");

    h.service.updateAppSettings({ defaultPermissionMode: "auto" });
    await h.service.createBot({ id: "p2", name: "P2", permissionMode: "ask", cwd: "/tmp/repo2" });
    await h.service.briefSettled("p2");
    const resetToConfiguredDefault = await h.service.relaunchBot("p2", { permissionMode: null });
    assert.equal(resetToConfiguredDefault.permissionMode, "auto", "explicit null follows a configured AppSettings.defaultPermissionMode too");
  } finally {
    await h.cleanup();
  }
});

test("relaunchBot rejects invalid launch options before touching any pane", async () => {
  const h = harness();
  try {
    const before = await h.service.createBot({ id: "gem", name: "Gem", kind: "gemini" });
    await h.service.briefSettled("gem");
    await assert.rejects(h.service.relaunchBot("gem", { reasoningEffort: "high" }), (e: unknown) => e instanceof RosterError && e.code === "invalid_launch_options");
    const log = h.fake.readLog().map((argv) => argv.join(" "));
    assert.equal(log.filter((line) => line.startsWith("agent start")).length, 1, "only the original createBot start, no relaunch attempt");
    assert.equal(h.profiles.get("gem")?.herdr.paneId, before.herdr.paneId);
  } finally {
    await h.cleanup();
  }
});

test("relaunchBot refuses an adopted bot (herdr-bot does not manage its launch settings)", async () => {
  const h = harness({ agents: [{ name: null, agent: "grok", agent_status: "idle", pane_id: "w7:p3", tab_id: "w7:t1", workspace_id: "w7", cwd: "/work/x" }], workspaces: [] });
  try {
    await h.service.createBot({ id: "scout", name: "Scout", adoptPaneId: "w7:p3" });
    await h.service.briefSettled("scout");
    await assert.rejects(h.service.relaunchBot("scout", { permissionMode: "auto" }), (e: unknown) => e instanceof RosterError && e.code === "invalid_launch_options");
  } finally {
    await h.cleanup();
  }
});

test("relaunchBot: herdr enforces one agent per name, so the old pane must close before the new one starts -- a failed start still keeps the settings patch (for a 지금 다시 시작 retry), leaving the bot pane-less rather than stuck on two names", async () => {
  const h = harness();
  try {
    setLogSink(() => undefined);
    const bot = await h.service.createBot({ id: "risky", name: "Risky", cwd: "/tmp/repo" });
    await h.service.briefSettled("risky");
    const oldPaneId = bot.herdr.paneId;
    let failNextStart = true;
    const failingCli: HerdrCli = {
      ...h.cli,
      async agentStart(args) {
        if (args.name === "risky" && failNextStart) throw new HerdrError("herdr_error", "boom");
        return h.cli.agentStart(args);
      },
    };
    const service = new RosterService({ config: h.config, profiles: h.profiles, rooms: h.rooms, cli: failingCli, mirror: h.mirror, now: () => 2_000, sleep: async () => undefined });
    await assert.rejects(service.relaunchBot("risky", { permissionMode: "auto" }), (e: unknown) => e instanceof RosterError && e.code === "herdr_error");
    // The old pane is already gone (freeing the name was mandatory for the retry to be able to
    // succeed at all); the attempted new pane is also closed by #startAgent's own failure cleanup --
    // the bot is left pane-less, not stranded on two different names or silently still "running" in
    // a pane that no longer exists.
    assert.equal(h.profiles.get("risky")?.herdr.paneId, null);
    assert.deepEqual(h.fake.readState().closedPanes, [oldPaneId, "w1:p100"]);
    // The settings patch itself survives the failed start, so a "지금 다시 시작" retry does not make
    // the user re-enter permissionMode/model/reasoningEffort/cwd.
    assert.equal(h.profiles.get("risky")?.permissionMode, "auto");
    // And the retry does succeed now that the name is free.
    failNextStart = false;
    const retried = await service.relaunchBot("risky", {});
    assert.equal(retried.herdr.paneId, "w1:p101");
    assert.equal(retried.permissionMode, "auto");
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    await h.cleanup();
  }
});
