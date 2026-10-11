import assert from "node:assert/strict";
import { test } from "node:test";
import { AppApiError, isAppApiError } from "../../src/app-api/errors.ts";
import { createAppClient, type AppApiTransport } from "../../src/app-api/client.ts";
import { createInMemoryTransport, type AppApiServerLike } from "../../src/app-api/in-memory-transport.ts";
import type { AppApiEvent } from "../../src/app-api/types.ts";

function fakeServer(overrides: Partial<AppApiServerLike> = {}): AppApiServerLike & { emit: (event: AppApiEvent) => void } {
  const listeners = new Set<(event: AppApiEvent) => void>();
  return {
    call: overrides.call ?? (async () => null),
    subscribe: overrides.subscribe ?? ((onEvent) => {
      listeners.add(onEvent);
      return () => listeners.delete(onEvent);
    }),
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
  };
}

test("call() round-trips params/result through the transport", async () => {
  const server = fakeServer({ call: async (method, params) => ({ method, params }) });
  const client = createAppClient(createInMemoryTransport(server));
  const result = await client.call("chat.search", { query: "hi" });
  assert.deepEqual(result, { method: "chat.search", params: { query: "hi" } });
});

test("call() rejects with a real AppApiError, from a thrown AppApiError or a plain payload", async () => {
  const server = fakeServer({ call: async () => { throw new AppApiError("unknown_bot", "no bot \"x\""); } });
  const client = createAppClient(createInMemoryTransport(server));
  await assert.rejects(client.call("bot.focus", { botId: "x" }), (error: unknown) => {
    assert.ok(isAppApiError(error));
    assert.equal(error.code, "unknown_bot");
    return true;
  });
});

test("call() wraps an arbitrary thrown value as an internal error", async () => {
  const server = fakeServer({ call: async () => { throw new Error("boom"); } });
  const client = createAppClient(createInMemoryTransport(server));
  await assert.rejects(client.call("host.status", undefined), (error: unknown) => {
    assert.ok(isAppApiError(error));
    assert.equal(error.code, "internal");
    assert.equal(error.message, "boom");
    return true;
  });
});

test("subscribe() filters by event type, a list of types, or '*'", () => {
  const server = fakeServer();
  const client = createAppClient(createInMemoryTransport(server));
  const chatChanges: unknown[] = [];
  const all: unknown[] = [];
  client.subscribe("chat.changed", (event) => chatChanges.push(event.payload));
  client.subscribe("*", (event) => all.push(event.type));
  client.subscribe(["transcript.entryAppended", "transcript.entryUpdated"], () => {
    throw new Error("should not fire for chat.changed/chat.listChanged");
  });

  server.emit({ seq: 1, type: "chat.listChanged", payload: [] });
  server.emit({ seq: 2, type: "chat.changed", payload: { id: "a" } as never });

  assert.deepEqual(chatChanges, [{ id: "a" }]);
  assert.deepEqual(all, ["chat.listChanged", "chat.changed"]);
});

test("a seq gap triggers onResyncNeeded; contiguous seqs do not", () => {
  const server = fakeServer();
  let resyncs = 0;
  const client = createAppClient(createInMemoryTransport(server), { onResyncNeeded: () => { resyncs += 1; } });
  client.subscribe("*", () => {});

  server.emit({ seq: 1, type: "chat.listChanged", payload: [] });
  server.emit({ seq: 2, type: "chat.listChanged", payload: [] });
  assert.equal(resyncs, 0);
  assert.equal(client.lastSeq(), 2);

  server.emit({ seq: 5, type: "chat.listChanged", payload: [] }); // gap: missed 3 and 4
  assert.equal(resyncs, 1);
  assert.equal(client.lastSeq(), 5);
});

test("an in-memory transport round-trips through structuredClone, catching non-cloneable results", async () => {
  const server = fakeServer({ call: async () => ({ fn: () => {} }) });
  const transport: AppApiTransport = createInMemoryTransport(server);
  await assert.rejects(transport.call("chat.list", undefined));
});
