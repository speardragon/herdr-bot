import assert from "node:assert/strict";
import { test } from "node:test";
import { callAppApi } from "../src/app-api-bridge.ts";
import { AppApiError } from "../../core/src/app-api/errors.ts";
import type { AppApiServer } from "../../core/src/app-api/server.ts";

function fakeServer(call: AppApiServer["call"]): AppApiServer {
  return { call, subscribe: () => () => {}, close: () => {} };
}

test("callAppApi resolves with an { ok: true, value } envelope on success", async () => {
  const server = fakeServer(async (method, params) => ({ method, params }));
  const envelope = await callAppApi(server, { method: "chat.list", params: undefined });
  assert.deepEqual(envelope, { ok: true, value: { method: "chat.list", params: undefined } });
});

test("callAppApi never throws: a thrown AppApiError becomes an { ok: false, error } envelope", async () => {
  const server = fakeServer(async () => { throw new AppApiError("unknown_bot", 'no bot "x"'); });
  const envelope = await callAppApi(server, { method: "bot.focus", params: { botId: "x" } });
  assert.deepEqual(envelope, { ok: false, error: { code: "unknown_bot", message: 'no bot "x"' } });
});

test("callAppApi maps an arbitrary thrown value to an internal error envelope", async () => {
  const server = fakeServer(async () => { throw new Error("boom"); });
  const envelope = await callAppApi(server, { method: "host.status", params: undefined });
  assert.deepEqual(envelope, { ok: false, error: { code: "internal", message: "boom" } });
});

test("callAppApi tolerates a malformed request (no method/params)", async () => {
  const server = fakeServer(async (method, params) => ({ method, params }));
  const envelope = await callAppApi(server, null);
  assert.deepEqual(envelope, { ok: true, value: { method: "", params: undefined } });
});
