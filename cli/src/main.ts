#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolveConfig } from "../../core/src/config.ts";
import { controlRequest } from "../../core/src/control/client.ts";
import { ControlError } from "../../core/src/control/protocol.ts";
import { createHost } from "../../core/src/host.ts";
import { log } from "../../core/src/log.ts";
import { parseCliArgs, type CliCommand } from "./args.ts";
import { installShim } from "./shim.ts";

function printTranscript(result: unknown): void {
  const entries = (result as { entries?: { author: string; text: string; timestampMs: number }[] }).entries ?? [];
  for (const entry of entries) {
    const time = new Date(entry.timestampMs).toISOString().slice(11, 16);
    process.stdout.write(`[${time}] ${entry.author}: ${entry.text}\n`);
  }
}

/** Spawning or adopting a bot waits on `herdr agent start` (30 s) plus the identity brief (60 s). */
const LONG_RUNNING_METHODS = new Set(["bot.create", "bot.adopt"]);
const DEFAULT_TIMEOUT_MS = 10_000;
const LONG_RUNNING_TIMEOUT_MS = 120_000;

async function runControl(command: Extract<CliCommand, { kind: "control" }>): Promise<void> {
  const config = resolveConfig();
  const timeoutMs = LONG_RUNNING_METHODS.has(command.method) ? LONG_RUNNING_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  const result = await controlRequest(config.controlSocketPath, command.method, command.params, timeoutMs);
  if (command.output === "transcript") printTranscript(result);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function serve(): Promise<void> {
  const config = resolveConfig();
  const host = createHost(config);
  await host.start();
  installShim(config.home, process.execPath, fileURLToPath(import.meta.url));
  log("cli", `herdr-bot host is serving (home ${config.home}). Press Ctrl+C to stop.`);
  await new Promise<void>((resolve) => {
    const stop = (): void => { void host.stop().then(resolve); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`herdr-bot: ${parsed.error}\n`);
    process.exit(2);
  }
  if (parsed.kind === "serve") return serve();
  if (parsed.kind === "install-shim") {
    const path = installShim(resolveConfig().home, process.execPath, fileURLToPath(import.meta.url));
    process.stdout.write(`${path}\n`);
    return;
  }
  await runControl(parsed);
}

main().catch((error: unknown) => {
  if (error instanceof ControlError) {
    process.stderr.write(`herdr-bot: ${error.code}: ${error.message}\n`);
    if (error.code === "connect_failed") process.stderr.write("herdr-bot: is the host running? start it with `herdr-bot serve` or open the herdr-bot app.\n");
  } else {
    process.stderr.write(`herdr-bot: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exit(1);
});
