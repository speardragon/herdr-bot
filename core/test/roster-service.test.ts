import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

function harness(state: FakeHerdrState = { agents: [], workspaces: [] }) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  const notices: string[] = [];
  const service = new RosterService({ config, profiles, rooms, cli, mirror, now: () => 1_000, onNotice: (chatId, text) => notices.push(`${chatId}: ${text}`) });
  return { temp, fake, config, profiles, rooms, cli, mirror, service, notices };
}

test("createBot spawns into a new workspace for a new cwd, then a tab for the next bot", async () => {
  const h = harness();
  try {
    const first = await h.service.createBot({ name: "Code Reviewer", kind: "claude", permissionMode: "ask" });
    assert.equal(first.id, "code-reviewer");
    assert.equal(first.herdr.paneId, "w1:p1");
    assert.equal(first.herdr.workspaceId, "w1");
    assert.equal(first.cwd, "/tmp/repo");
    const second = await h.service.createBot({ id: "fixer", name: "Fixer", kind: "codex", permissionMode: "auto" });
    assert.equal(second.herdr.paneId, "w1:p100");
    const log = h.fake.readLog().map((argv) => argv.join(" "));
    assert.ok(log.some((line) => line.startsWith("workspace create --cwd /tmp/repo --label herdr-bot: repo")));
    assert.ok(log.some((line) => line.startsWith("tab create --workspace w1 --cwd /tmp/repo --label fixer")));
    assert.ok(log.some((line) => line === `agent start code-reviewer --kind claude --pane w1:p1 -- --allowedTools Bash(${h.config.cliPath} *)`));
    assert.ok(log.some((line) => line === "agent start fixer --kind codex --pane w1:p100 -- -s workspace-write -a on-request"));
    const brief = h.fake.readState().prompts?.find((p) => p.target === "code-reviewer");
    assert.match(brief?.text ?? "", /You are "Code Reviewer"/);
    assert.equal(h.mirror.get("fixer").status, "idle");
  } finally {
    h.temp.cleanup();
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
    h.temp.cleanup();
  }
});

test("a bot that is still being onboarded cannot be invited into a room", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "ready-bot", name: "Ready" });
    h.profiles.save(sampleProfile({ id: "bot-abc", name: "New bot", onboarding: { requestId: "abc", locale: "en", stage: "provisioning", error: null } }));
    assert.throws(() => h.service.createRoom({ name: "r", memberIds: ["ready-bot", "bot-abc"] }), (e: unknown) => e instanceof RosterError && e.code === "bot_not_ready");
  } finally {
    h.temp.cleanup();
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
    h.temp.cleanup();
  }
});

test("a bot blocked during startup is saved with a setup notice", async () => {
  const h = harness({ agents: [], workspaces: [], startBlocked: ["needy"] });
  try {
    const bot = await h.service.createBot({ id: "needy", name: "Needy" });
    assert.equal(bot.id, "needy");
    assert.ok(h.notices.some((n) => n.startsWith("needy: ") && /first-run/.test(n)), JSON.stringify(h.notices));
  } finally {
    h.temp.cleanup();
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
    assert.equal(h.fake.readState().agents[0]?.name, "scout");
    assert.equal((await h.service.listAdoptable()).length, 0);
    assert.equal(h.service.resolveBotByPane("w7:p3")?.id, "scout");
    await h.service.deleteBot("scout");
    assert.equal(h.fake.readState().agents[0]?.name, null);
    assert.equal(h.fake.readState().closedPanes, undefined);
    assert.equal(h.profiles.get("scout"), null);
  } finally {
    h.temp.cleanup();
  }
});

test("deleting a spawned bot closes its pane and removes it from rooms", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "a", name: "A" });
    await h.service.createBot({ id: "b", name: "B" });
    const room = h.service.createRoom({ name: "Auth", memberIds: ["a", "b"] });
    assert.ok(room.id.startsWith("room-auth-"));
    await h.service.deleteBot("a");
    assert.deepEqual(h.fake.readState().closedPanes, ["w1:p1"]);
    assert.deepEqual(h.rooms.get(room.id)?.memberIds, ["b"]);
    assert.throws(() => h.service.setRoomMembers(room.id, ["b", "ghost"]), (e: unknown) => e instanceof RosterError && e.code === "unknown_bot");
    assert.throws(() => h.service.createRoom({ name: "big", memberIds: ["b", "b1", "b2", "b3", "b4", "b5", "b6"] }), (e: unknown) => e instanceof RosterError && e.code === "too_many_members");
  } finally {
    h.temp.cleanup();
  }
});

test("updateProfile and rooms round-trip", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "a", name: "A" });
    const updated = h.service.updateProfile("a", { name: "Ava", description: "helps", isHiddenFromSidebar: true });
    assert.equal(updated?.name, "Ava");
    assert.equal(updated?.isHiddenFromSidebar, true);
    const room = h.service.createRoom({ name: "r", memberIds: ["a"] });
    assert.equal(h.service.updateRoom(room.id, { name: "renamed" })?.name, "renamed");
    h.service.deleteRoom(room.id);
    assert.equal(existsSync(`${h.temp.home}/rooms/${room.id}`), false);
    assert.deepEqual(h.service.memberIdFor("a"), { id: "a", name: "Ava", description: "helps" });
  } finally {
    h.temp.cleanup();
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
  } finally {
    setLogSink((line) => process.stderr.write(`${line}\n`));
    h.temp.cleanup();
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
    h.temp.cleanup();
  }
});
