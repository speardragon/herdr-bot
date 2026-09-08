import { test } from "node:test";
import assert from "node:assert/strict";
import { createRendererPortServer } from "../src/coordinator/port-server.ts";
import type { CoordinatorFrame, CoordinatorReplyOutcome } from "../src/coordinator/frames.ts";

type Dispatch = (method: string, args: unknown) => Promise<CoordinatorReplyOutcome>;

function harness(dispatch: Dispatch = async (method, args) => ({ status: "ok" as const, value: { method, args } })) {
  const posted: CoordinatorFrame[] = [];
  let closed = false;
  const server = createRendererPortServer({ post: (frame) => posted.push(frame), close: () => { closed = true; } }, { dispatchRequest: dispatch });
  return { posted, server, isClosed: () => closed };
}

test("hello → ready handshake, then requests get replies and events are forwarded", async () => {
  const h = harness();
  h.server.handleMessage({ kind: "lifecycle", phase: "hello", protocolVersion: 1 });
  assert.deepEqual(h.posted[0], { kind: "lifecycle", phase: "ready", protocolVersion: 1 });
  h.server.handleMessage({ kind: "request", requestId: "r1", method: "listAgents", args: {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(h.posted[1], { kind: "reply", requestId: "r1", outcome: { status: "ok", value: { method: "listAgents", args: {} } } });
  h.server.postEvent("agents", [1]);
  assert.deepEqual(h.posted[2], { kind: "event", family: "agents", payload: [1] });
});

test("protocol breaches shut the session down", async () => {
  const h = harness();
  h.server.handleMessage({ kind: "request", requestId: "r1", method: "x", args: {} });
  const settlement = await h.server.settled;
  assert.equal(settlement.outcome, "protocol-breach");
  assert.equal(h.isClosed(), true);
  assert.equal((h.posted[0] as { phase: string }).phase, "shutdown");
});

test("wrong protocol version and malformed frames are rejected", async () => {
  const h = harness();
  h.server.handleMessage({ kind: "lifecycle", phase: "hello", protocolVersion: 2 });
  assert.equal((await h.server.settled).outcome, "protocol-breach");
  const g = harness();
  g.server.handleMessage("garbage");
  assert.equal((await g.server.settled).outcome, "protocol-breach");
});

test("cancel aborts an in-flight request", async () => {
  let aborted = false;
  const h = harness((_method, _args) => new Promise((resolve) => { setTimeout(() => resolve({ status: "ok", value: 1 }), 50); }));
  h.server.handleMessage({ kind: "lifecycle", phase: "hello", protocolVersion: 1 });
  const server = createRendererPortServer({ post: (frame) => h.posted.push(frame), close: () => undefined }, {
    dispatchRequest: (_m, _a, signal) => new Promise((resolve) => { signal.addEventListener("abort", () => { aborted = true; }); setTimeout(() => resolve({ status: "ok", value: 1 }), 50); }),
  });
  server.handleMessage({ kind: "lifecycle", phase: "hello", protocolVersion: 1 });
  server.handleMessage({ kind: "request", requestId: "r1", method: "slow", args: {} });
  server.handleMessage({ kind: "cancel", requestId: "r1" });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(aborted, true);
  assert.ok(h.posted.some((f) => f.kind === "reply" && f.requestId === "r1" && f.outcome.status === "failed" && f.outcome.failure.code === "cancelled"));
});
