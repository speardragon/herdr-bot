#!/usr/bin/env node
// Launches the desktop app against the test fake herdr so the UI can be exercised without a real herdr session.
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const home = process.env.HERDR_BOT_HOME ?? "/tmp/hb-dev-fake";
mkdirSync(home, { recursive: true });
const fakeBin = join(root, "core", "test", "helpers", "fake-herdr.mjs");
chmodSync(fakeBin, 0o755);
const statePath = join(home, "fake-herdr-state.json");
writeFileSync(statePath, JSON.stringify({
  agents: [],
  workspaces: [],
  onPrompt: {
    reviewer: { say: ["Reviewed. Two nits: naming in auth.ts and a missing test."], finalStatus: "idle" },
    writer: { say: ["Draft ready in docs/auth.md — want a shorter version?"], finalStatus: "idle" },
  },
}, null, 2));

const env = {
  ...process.env,
  HERDR_BOT_HOME: home,
  HERDR_BIN_PATH: fakeBin,
  HERDR_SOCKET_PATH: join(home, "no-herdr.sock"),
  FAKE_HERDR_STATE: statePath,
  FAKE_HERDR_LOG: join(home, "fake-herdr-log.jsonl"),
  HERDR_BOT_USER_NAME: process.env.HERDR_BOT_USER_NAME ?? "ray",
  HERDR_BOT_DEV: "1",
};
const child = spawn("npm", ["run", "start", "-w", "@herdr-bot/desktop"], { cwd: root, env, stdio: "inherit" });
child.on("error", (error) => { process.stderr.write(`dev-fake-herdr: failed to launch electron: ${error.message}\n`); process.exit(1); });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
