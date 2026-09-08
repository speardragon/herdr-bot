#!/usr/bin/env node
// Fake `herdr` binary for tests. State lives in $FAKE_HERDR_STATE (JSON); every call is logged to $FAKE_HERDR_LOG.
import { readFileSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const statePath = process.env.FAKE_HERDR_STATE;
const logPath = process.env.FAKE_HERDR_LOG;
if (!statePath) fail("fake_config", "FAKE_HERDR_STATE is not set");
const state = JSON.parse(readFileSync(statePath, "utf8"));
state.agents ??= [];
state.workspaces ??= [];
state.counters ??= { workspace: state.workspaces.length + 1, pane: 100, tab: 10 };
state.onPrompt ??= {};
state.prompts ??= [];
if (logPath) appendFileSync(logPath, `${JSON.stringify({ argv: process.argv.slice(2) })}\n`);

const argv = process.argv.slice(2);
const [group, command, ...rest] = argv;

function ok(result) {
  process.stdout.write(`${JSON.stringify({ id: "fake", result })}\n`);
  save();
  process.exit(0);
}
function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ id: "fake", error: { code, message } })}\n`);
  process.exit(1);
}
function save() {
  const temp = `${statePath}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2));
  renameSync(temp, statePath);
}
function flag(name) {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
}
function positionals() {
  const out = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--") break;
    if (rest[i].startsWith("--")) { if (!["--wait", "--no-focus", "--clear"].includes(rest[i])) i += 1; continue; }
    out.push(rest[i]);
  }
  return out;
}
function afterDoubleDash() {
  const index = rest.indexOf("--");
  return index >= 0 ? rest.slice(index + 1) : [];
}
function findAgent(target) {
  return state.agents.find((agent) => agent.name === target || agent.pane_id === target) ?? null;
}

function controlRequest(method, params) {
  return new Promise((resolve, reject) => {
    const socketPath = join(process.env.HERDR_BOT_HOME ?? "", "host.sock");
    const socket = connect(socketPath);
    let buffer = "";
    socket.on("connect", () => socket.write(`${JSON.stringify({ id: "fake-1", method, params })}\n`));
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const reply = JSON.parse(buffer.slice(0, newline));
      socket.destroy();
      reply.error ? reject(new Error(reply.error.code)) : resolve(reply.result);
    });
    socket.on("error", reject);
  });
}

async function agentPrompt() {
  const [target, text] = positionals();
  const agent = findAgent(target);
  if (!agent) fail("agent_not_running", `no agent ${target}`);
  if (agent.agent_status === "blocked") fail("agent_blocked", "agent is blocked");
  state.prompts.push({ target, text });
  const script = state.onPrompt[agent.name] ?? null;
  // Only turn prompts carry a room/DM tag; the identity brief must not trigger scripted replies.
  const isTurnPrompt = /\[herdr-bot (room |DM\])/.test(text);
  const roomMatch = /\bsay (\S+) "/.exec(text);
  const chatId = roomMatch ? roomMatch[1] : null;
  if (script && chatId && isTurnPrompt) {
    for (const say of script.say ?? []) {
      try { await controlRequest("say", { chatId, text: say, paneId: agent.pane_id }); } catch (error) { state.sayErrors = [...(state.sayErrors ?? []), String(error.message)]; }
    }
    if (script.sayOnce) state.onPrompt[agent.name] = { ...script, say: [] };
  }
  const final = script?.finalStatus ?? "idle";
  if (final === "stalled") fail("agent_prompt_stalled", "no activity observed");
  if (final === "timeout") fail("timeout", "wait timed out");
  agent.agent_status = final;
  ok({ agent });
}

async function main() {
  if (group === "agent" && command === "list") return ok({ agents: state.agents });
  if (group === "agent" && command === "get") {
    const agent = findAgent(positionals()[0]);
    return agent ? ok({ agent }) : fail("agent_not_found", "no such agent");
  }
  if (group === "agent" && command === "start") {
    const [name] = positionals();
    const kind = flag("--kind"); const paneId = flag("--pane");
    if (state.agents.some((agent) => agent.pane_id === paneId)) fail("pane_busy", "pane already has an agent");
    if (state.agents.some((agent) => agent.name === name)) fail("agent_name_taken", "name in use");
    if (state.startBlocked?.includes(name)) fail("agent_not_ready", "blocked during startup");
    const workspaceId = paneId.split(":")[0];
    const agent = { name, agent: kind, agent_status: "idle", pane_id: paneId, tab_id: `${workspaceId}:t1`, workspace_id: workspaceId, cwd: state.cwdByPane?.[paneId] ?? "/tmp", agent_session: { value: randomUUID() }, args: afterDoubleDash() };
    state.agents.push(agent);
    return ok({ agent });
  }
  if (group === "agent" && command === "prompt") return agentPrompt();
  if (group === "agent" && command === "rename") {
    const [target, name] = positionals();
    const agent = findAgent(target);
    if (!agent) fail("agent_not_found", "no such agent");
    agent.name = rest.includes("--clear") ? null : name;
    return ok({ agent });
  }
  if (group === "agent" && command === "focus") return findAgent(positionals()[0]) ? ok({ type: "agent_focus" }) : fail("agent_not_found", "no such agent");
  if (group === "agent" && command === "read") { process.stdout.write("fake screen\n"); process.exit(0); }
  if (group === "workspace" && command === "list") return ok({ workspaces: state.workspaces });
  if (group === "workspace" && command === "create") {
    const id = `w${state.counters.workspace++}`;
    state.workspaces.push({ workspace_id: id, label: flag("--label") ?? id });
    const paneId = `${id}:p1`;
    state.cwdByPane = { ...(state.cwdByPane ?? {}), [paneId]: flag("--cwd") ?? "/tmp" };
    return ok({ workspace: { workspace_id: id }, tab: { tab_id: `${id}:t1` }, root_pane: { pane_id: paneId } });
  }
  if (group === "tab" && command === "create") {
    const workspaceId = flag("--workspace");
    if (!state.workspaces.some((ws) => ws.workspace_id === workspaceId)) fail("workspace_not_found", "no such workspace");
    const paneId = `${workspaceId}:p${state.counters.pane++}`;
    state.cwdByPane = { ...(state.cwdByPane ?? {}), [paneId]: flag("--cwd") ?? "/tmp" };
    return ok({ tab: { tab_id: `${workspaceId}:t${state.counters.tab++}` }, root_pane: { pane_id: paneId } });
  }
  if (group === "pane" && command === "close") {
    const [paneId] = positionals();
    state.agents = state.agents.filter((agent) => agent.pane_id !== paneId);
    state.closedPanes = [...(state.closedPanes ?? []), paneId];
    return ok({ type: "pane_close" });
  }
  if (group === "notification" && command === "show") return ok({ type: "notification_show", shown: true, reason: "shown" });
  fail("fake_unknown_command", `unhandled: ${argv.join(" ")}`);
}

main().catch((error) => fail("fake_crash", String(error?.stack ?? error)));
