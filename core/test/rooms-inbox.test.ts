/**
 * Covers three behaviors whose logic lives OUTSIDE core/src/rooms/ -- in SayInbox (stale-for),
 * ChatService (held-question markers), and TurnService (the bot<->bot loop guard). These tests pin
 * that pre-existing, already-correct behavior rather than duplicate it inside the rooms module; see
 * cycle.ts's design note (decisions #2 and #5) for why those two behaviors are deliberately left
 * exactly as this code already implements them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SayInbox } from "../src/bots/say-inbox.ts";
import { resolveConfig } from "../src/config.ts";
import { HostEvents } from "../src/host-events.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { ChatService } from "../src/services/chat-service.ts";
import { RosterService } from "../src/services/roster-service.ts";
import { RunQueue } from "../src/services/run-queue.ts";
import { TurnService } from "../src/services/turn-service.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { RoomStore } from "../src/store/room-store.ts";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import { ControlError } from "../src/control/protocol.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";

test("stale-for: a second interrupt before any say overwrites the first, with no trace of it", () => {
  const inbox = new SayInbox();
  inbox.open("room-1", "a");
  inbox.markInterrupted("room-1", "a", "e1");
  inbox.markInterrupted("room-1", "a", "e2"); // "e1" is silently superseded
  assert.deepEqual(inbox.accept("room-1", "a", "answering"), { mode: "in-turn", staleFor: "e2" });
});

function chatHarness() {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BOT_USER_NAME: "Mina" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  profiles.save(sampleProfile({ id: "atlas", name: "Atlas" }));
  rooms.save(sampleRoom({ id: "room-1", memberIds: ["atlas"] }));
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  const events = new HostEvents();
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: () => false });
  return { temp, chat };
}

test("held questions: several busy-skips for different human messages accumulate, a repeat for the same message is a no-op, and one turn clears only the oldest", () => {
  const h = chatHarness();
  try {
    const first = h.chat.appendUser("room-1", { content: "can you check the build?" });
    h.chat.markHeld("room-1", first.id, "atlas");
    const second = h.chat.appendUser("room-1", { content: "also look at the deploy log" });
    h.chat.markHeld("room-1", second.id, "atlas");
    h.chat.markHeld("room-1", second.id, "atlas"); // same message held twice in a row -> no duplicate
    const third = h.chat.appendUser("room-1", { content: "and the test flakiness too" });
    h.chat.markHeld("room-1", third.id, "atlas");

    const held = h.chat.heldEntriesFor("room-1", "atlas");
    assert.deepEqual(held.map((entry) => entry.content), [
      "can you check the build?",
      "also look at the deploy log",
      "and the test flakiness too",
    ]);

    // atlas finally speaks: only the oldest held question is addressed/cleared.
    h.chat.clearHeld("room-1", first.id, "atlas");
    const remaining = h.chat.heldEntriesFor("room-1", "atlas");
    assert.deepEqual(remaining.map((entry) => entry.content), ["also look at the deploy log", "and the test flakiness too"]);
  } finally {
    h.temp.cleanup();
  }
});

const agent = (name: string) => ({ name, agent: "claude", agent_status: "idle" as const, pane_id: `w1:p-${name}`, tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" });

async function turnHarness(state: FakeHerdrState, now: () => number) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  for (const a of state.agents) profiles.save(sampleProfile({ id: a.name ?? "x", name: (a.name ?? "x").toUpperCase(), herdr: { paneId: a.pane_id, workspaceId: "w1", sessionId: null } }));
  rooms.save(sampleRoom({ id: "room-1", memberIds: [] }));
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  await mirror.refresh();
  const events = new HostEvents();
  const runQueue = new RunQueue();
  const inbox = new SayInbox(now);
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: () => false, now });
  const roster = new RosterService({ config, profiles, rooms, cli, mirror });
  const turns = new TurnService({ config, roster, chat, runQueue, cli, mirror, inbox, now });
  return { temp, turns, cleanup: () => temp.cleanup() };
}

test("bot<->bot loop guard: a partial trailing window lets an attempt through once only the oldest timestamp has aged out", async () => {
  let now = 0;
  const h = await turnHarness({ agents: [agent("a"), agent("b")], workspaces: [] }, () => now);
  try {
    h.turns.handleMessage("w1:p-a", "b", "t=0"); // t=0
    now = 60_000;
    h.turns.handleMessage("w1:p-a", "b", "t=1min"); // t=1min
    now = 120_000;
    h.turns.handleMessage("w1:p-a", "b", "t=2min"); // t=2min -- 3 on record: 0, 1, 2 (minutes)

    now = 180_000; // t=3min: window starts at t=-2min, all three (0,1,2) still inside it -- rejected
    assert.throws(() => h.turns.handleMessage("w1:p-a", "b", "t=3min"), (error: unknown) => error instanceof ControlError && error.code === "over_cap");

    now = 330_000; // t=5.5min: window starts at t=0.5min -- only t=0 has aged out, t=1/t=2 remain (2 < ceiling 3) -- allowed
    assert.doesNotThrow(() => h.turns.handleMessage("w1:p-a", "b", "t=5.5min"));
  } finally {
    await h.cleanup();
  }
});
