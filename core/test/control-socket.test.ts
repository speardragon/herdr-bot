import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { ControlError, parseControlRequest } from "../src/control/protocol.ts";
import { startControlServer } from "../src/control/server.ts";
import { controlRequest } from "../src/control/client.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("parseControlRequest validates shape", () => {
  assert.deepEqual(parseControlRequest('{"id":"1","method":"say","params":{"a":1}}'), { id: "1", method: "say", params: { a: 1 } });
  assert.deepEqual(parseControlRequest('{"id":"1","method":"rooms"}'), { id: "1", method: "rooms", params: {} });
  assert.equal(parseControlRequest("nope"), null);
  assert.equal(parseControlRequest('{"method":"say"}'), null);
});

test("server dispatches requests, maps ControlError codes, and serves many requests per connection", async () => {
  const temp = makeTempHome();
  const socketPath = join(temp.home, "host.sock");
  const server = await startControlServer(socketPath, async (method, params) => {
    if (method === "echo") return { got: params };
    if (method === "boom") throw new ControlError("unknown_chat", "no such chat");
    if (method === "crash") throw new Error("unexpected");
    throw new ControlError("unknown_method", method);
  });
  try {
    assert.deepEqual(await controlRequest(socketPath, "echo", { x: 1 }), { got: { x: 1 } });
    await assert.rejects(controlRequest(socketPath, "boom", {}), (error: unknown) => error instanceof ControlError && error.code === "unknown_chat");
    await assert.rejects(controlRequest(socketPath, "crash", {}), (error: unknown) => error instanceof ControlError && error.code === "internal");
    await assert.rejects(controlRequest(socketPath, "nope", {}), (error: unknown) => error instanceof ControlError && error.code === "unknown_method");
  } finally {
    await server.close();
    temp.cleanup();
  }
});

test("a stale socket file is replaced; a live one refuses to start twice", async () => {
  const temp = makeTempHome();
  const socketPath = join(temp.home, "host.sock");
  writeFileSync(socketPath, "");
  const server = await startControlServer(socketPath, async () => null);
  try {
    await assert.rejects(startControlServer(socketPath, async () => null), (error: unknown) => error instanceof ControlError && error.code === "host_already_running");
  } finally {
    await server.close();
    temp.cleanup();
  }
});

test("client reports connect_failed when no host is listening", async () => {
  const temp = makeTempHome();
  try {
    await assert.rejects(controlRequest(join(temp.home, "none.sock"), "rooms", {}, 500), (error: unknown) => error instanceof ControlError && error.code === "connect_failed");
  } finally {
    temp.cleanup();
  }
});
