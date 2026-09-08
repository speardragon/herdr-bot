import { test } from "node:test";
import assert from "node:assert/strict";
import { attachRendererPort, type MessagePortMainLike } from "../src/coordinator-port.ts";
import { createHost } from "../../core/src/host.ts";
import { resolveConfig } from "../../core/src/config.ts";
import { createHerdrCli } from "../../core/src/herdr/cli.ts";
import { installFakeHerdr } from "../../core/test/helpers/fake-herdr-state.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

function fakePort() {
  const posted: unknown[] = [];
  const handlers = new Map<string, ((event: { data: unknown }) => void)[]>();
  const port: MessagePortMainLike = {
    postMessage: (message) => posted.push(message),
    start: () => undefined,
    close: () => undefined,
    on: (event: string, handler: unknown) => { handlers.set(event, [...(handlers.get(event) ?? []), handler as (event: { data: unknown }) => void]); },
  };
  return { port, posted, emit: (data: unknown) => { for (const handler of handlers.get("message") ?? []) handler({ data }); } };
}

test("renderer frames reach the dispatcher and host events are forwarded as coordinator events", async () => {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home);
  const host = createHost(resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath }), { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null });
  await host.start();
  const { port, posted, emit } = fakePort();
  const attached = attachRendererPort(port, host);
  try {
    emit({ kind: "lifecycle", phase: "hello", protocolVersion: 1 });
    emit({ kind: "request", requestId: "r1", method: "listAgents", args: {} });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(posted[0], { kind: "lifecycle", phase: "ready", protocolVersion: 1 });
    assert.deepEqual(posted[1], { kind: "reply", requestId: "r1", outcome: { status: "ok", value: [] } });
    host.chat.emitRoster();
    assert.deepEqual(posted[2], { kind: "event", family: "agents", payload: [] });
    attached.detach();
    host.chat.emitRoster();
    assert.equal(posted.length, 3);
  } finally {
    await host.stop();
    temp.cleanup();
  }
});
