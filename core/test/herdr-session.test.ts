import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureHerdrSession } from "../src/herdr/session.ts";
import { HerdrError } from "../src/herdr/types.ts";

function listing(states: readonly boolean[]) {
  let call = 0;
  return {
    calls: () => call,
    sessionList: async () => {
      const running = states[Math.min(call, states.length - 1)] ?? false;
      call += 1;
      return [{ name: "herdr-bot", running, socketPath: "/h/sessions/herdr-bot/herdr.sock" }];
    },
  };
}

test("a running session is reused without spawning a server", async () => {
  const list = listing([true]);
  let spawned = 0;
  const socketPath = await ensureHerdrSession({ session: "herdr-bot", sessionList: list.sessionList, spawnServer: () => { spawned += 1; }, sleep: async () => {}, timeoutMs: 1_000 });
  assert.equal(socketPath, "/h/sessions/herdr-bot/herdr.sock");
  assert.equal(spawned, 0);
});

test("a stopped session is started headlessly and polled until it reports running", async () => {
  const list = listing([false, false, true]);
  let spawned = 0;
  const slept: number[] = [];
  const socketPath = await ensureHerdrSession({ session: "herdr-bot", sessionList: list.sessionList, spawnServer: () => { spawned += 1; }, sleep: async (ms) => { slept.push(ms); }, timeoutMs: 1_000 });
  assert.equal(socketPath, "/h/sessions/herdr-bot/herdr.sock");
  assert.equal(spawned, 1);
  assert.equal(list.calls(), 3);
  assert.ok(slept.length >= 1);
});

test("a session that never comes up fails with herdr_session_unavailable", async () => {
  const list = listing([false]);
  let now = 0;
  await assert.rejects(
    ensureHerdrSession({ session: "herdr-bot", sessionList: list.sessionList, spawnServer: () => {}, sleep: async (ms) => { now += ms; }, timeoutMs: 1_000, now: () => now }),
    (error: unknown) => error instanceof HerdrError && error.code === "herdr_session_unavailable",
  );
});

test("an unknown session name (not listed at all) is treated as stopped and started", async () => {
  let call = 0;
  const sessionList = async () => { call += 1; return call < 2 ? [{ name: "default", running: true, socketPath: "/h/herdr.sock" }] : [{ name: "default", running: true, socketPath: "/h/herdr.sock" }, { name: "lab", running: true, socketPath: "/h/sessions/lab/herdr.sock" }]; };
  let spawned = 0;
  assert.equal(await ensureHerdrSession({ session: "lab", sessionList, spawnServer: () => { spawned += 1; }, sleep: async () => {}, timeoutMs: 1_000 }), "/h/sessions/lab/herdr.sock");
  assert.equal(spawned, 1);
});
