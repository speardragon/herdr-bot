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

// A leading global `--session <name>` selects the herdr session, exactly like the real binary.
const rawArgv = process.argv.slice(2);
const sessionName = rawArgv[0] === "--session" ? rawArgv[1] : "default";
const argv = rawArgv[0] === "--session" ? rawArgv.slice(2) : rawArgv;
const [group, command, ...rest] = argv;

function ok(result, mutated = true) {
  process.stdout.write(`${JSON.stringify({ id: "fake", result })}\n`);
  // Read-only commands must not re-save: a concurrent mutating call could finish first, and
  // saving our own (now stale) in-memory snapshot would silently erase its update.
  if (mutated) save();
  process.exit(0);
}
function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ id: "fake", error: { code, message } })}\n`);
  process.exit(1);
}
function save() {
  // Unique per process: two fake-herdr invocations racing on a shared ".tmp" path can rename
  // each other's temp file out from under themselves (ENOENT). This keeps concurrent saves independent.
  const temp = `${statePath}.tmp.${process.pid}`;
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
  // Only turn prompts carry a room/DM tag at the very start; the identity brief opens with the
  // bare "[herdr-bot]" tag but also *mentions* "[herdr-bot room ...]"/"[herdr-bot DM]" further down
  // as documentation, so this must anchor to the start of the text or the brief would falsely match.
  const isTurnPrompt = /^\[herdr-bot (room |DM\])/.test(text);
  const roomMatch = /\bsay (\S+) "/.exec(text);
  const chatId = roomMatch ? roomMatch[1] : null;
  const exactScript = state.onPrompt[agent.name] ?? null;
  // A real onboarding-greeting turn (see bots/onboarding.ts#buildGreetingPrompt) always embeds its
  // own exact required text, so this can auto-answer it correctly for ANY bot name/locale -- but
  // only when the caller has not scripted this exact bot id. bot-onboarding-service.test.ts covers
  // "a wrong greeting is rejected" by scripting the bot's exact id with a deliberately wrong `say`,
  // so `exactScript` still wins there and this fallback never overrides it.
  const greetingMatch = exactScript == null && /\[herdr-bot onboarding\]/.test(text) ? /The exact message is: (".*")/.exec(text) : null;
  // "*" is a dev-only convenience: scripts/dev-fake-herdr.mjs seeds it so an ordinary (non-greeting)
  // turn from a generated bot name still gets a canned reply. Test suites built via
  // fake-herdr-state.ts never set either key, so their exact-name-only expectations are unaffected.
  const script = exactScript ?? (greetingMatch == null ? state.onPrompt["*"] ?? null : { say: [JSON.parse(greetingMatch[1])], finalStatus: "idle" });
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
  if (group === "session" && command === "list") {
    // Bare payload without the { id, result } envelope, as real herdr prints it. Sockets live under HERDR_BOT_HOME here.
    const home = process.env.HERDR_BOT_HOME ?? "";
    const socket = sessionName === "default" ? join(home, "herdr.sock") : join(home, "sessions", sessionName, "herdr.sock");
    process.stdout.write(`${JSON.stringify({ sessions: [{ default: sessionName === "default", name: sessionName, running: true, session_dir: home, socket_path: socket }] })}\n`);
    process.exit(0);
  }
  if (group === "server") process.exit(0);
  if (group === "agent" && command === "list") return ok({ agents: state.agents }, false);
  if (group === "agent" && command === "get") {
    const agent = findAgent(positionals()[0]);
    return agent ? ok({ agent }, false) : fail("agent_not_found", "no such agent");
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
  if (group === "agent" && command === "focus") return findAgent(positionals()[0]) ? ok({ type: "agent_focus" }, false) : fail("agent_not_found", "no such agent");
  if (group === "agent" && command === "read") { process.stdout.write("fake screen\n"); process.exit(0); }
  if (group === "workspace" && command === "list") return ok({ workspaces: state.workspaces }, false);
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
