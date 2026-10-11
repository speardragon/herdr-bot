import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { spawn } from "node:child_process";
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

test("close() destroys open connections instead of waiting for peers to hang up", async () => {
  const temp = makeTempHome();
  const socketPath = join(temp.home, "host.sock");
  const server = await startControlServer(socketPath, async () => null);
  const silentPeer = connect(socketPath);
  await new Promise<void>((resolve, reject) => {
    silentPeer.once("connect", resolve);
    silentPeer.once("error", reject);
  });
  try {
    const start = Date.now();
    await server.close();
    assert.ok(Date.now() - start < 1000, "close() should resolve promptly even with an open peer connection");
    assert.equal(existsSync(socketPath), false);
  } finally {
    silentPeer.destroy();
    temp.cleanup();
  }
});

test("a stale socket file backed by a wedged listener is treated as dead once the probe times out", async () => {
  const temp = makeTempHome();
  const socketPath = join(temp.home, "host.sock");

  // A child process that listens with a backlog of 1 and then freezes (SIGSTOP) before
  // ever calling accept(). The kernel still queues one connection into the backlog for a
  // frozen listener, so a single filler connection fills it; any connection attempt after
  // that has nowhere to go and hangs until something drains the backlog — which never
  // happens here, exercising the probe's own timeout.
  const child = spawn(process.execPath, [
    "-e",
    "const net=require('node:net'); const s=net.createServer(); s.listen({path: process.argv[1], backlog: 1}, () => console.log('READY'));",
    socketPath,
  ]);
  try {
    await new Promise<void>((resolve, reject) => {
      child.stdout?.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("READY")) resolve();
      });
      child.once("error", reject);
      child.once("exit", (codeValue) => reject(new Error(`listener child exited early with code ${codeValue}`)));
    });
    child.kill("SIGSTOP");

    const filler = connect(socketPath);
    await new Promise<void>((resolve, reject) => {
      filler.once("connect", resolve);
      filler.once("error", reject);
    });

    try {
      const start = Date.now();
      const server = await startControlServer(socketPath, async () => null);
      assert.ok(Date.now() - start < 2000, "startControlServer should not hang on a wedged stale socket file");
      await server.close();
    } finally {
      filler.destroy();
    }
  } finally {
    child.kill("SIGKILL");
    temp.cleanup();
  }
});
