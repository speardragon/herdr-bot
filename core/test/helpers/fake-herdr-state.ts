import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FakeAgent {
  name: string | null;
  agent: string;
  agent_status: "idle" | "working" | "blocked" | "done" | "unknown";
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  cwd: string;
  agent_session?: { value: string } | null;
  args?: string[];
}

export interface FakeHerdrState {
  agents: FakeAgent[];
  workspaces: { workspace_id: string; label: string }[];
  /** `sayOnce` clears the script after its first turn so bots do not chatter through every round. */
  onPrompt?: Record<string, { say?: string[]; finalStatus?: string; sayOnce?: boolean }>;
  startBlocked?: string[];
  prompts?: { target: string; text: string }[];
  closedPanes?: string[];
  sayErrors?: string[];
  /** What `agent read <name>` prints, keyed by agent name (a blocked agent's approval/question form). */
  screens?: Record<string, string>;
}

export interface FakeHerdr {
  readonly binPath: string;
  readonly statePath: string;
  readonly logPath: string;
  readonly env: NodeJS.ProcessEnv;
  writeState(state: FakeHerdrState): void;
  readState(): FakeHerdrState;
  readLog(): string[][];
}

export const EMPTY_FAKE_STATE: FakeHerdrState = { agents: [], workspaces: [] };

export function installFakeHerdr(home: string, initial: FakeHerdrState = EMPTY_FAKE_STATE): FakeHerdr {
  const binPath = join(dirname(fileURLToPath(import.meta.url)), "fake-herdr.mjs");
  chmodSync(binPath, 0o755);
  const statePath = join(home, "fake-herdr-state.json");
  const logPath = join(home, "fake-herdr-log.jsonl");
  const env: NodeJS.ProcessEnv = { ...process.env, FAKE_HERDR_STATE: statePath, FAKE_HERDR_LOG: logPath, HERDR_BOT_HOME: home };
  const fake: FakeHerdr = {
    binPath,
    statePath,
    logPath,
    env,
    writeState: (state) => writeFileSync(statePath, JSON.stringify(state, null, 2)),
    readState: () => JSON.parse(readFileSync(statePath, "utf8")) as FakeHerdrState,
    readLog: () => (existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => (JSON.parse(line) as { argv: string[] }).argv) : []),
  };
  fake.writeState(initial);
  return fake;
}
