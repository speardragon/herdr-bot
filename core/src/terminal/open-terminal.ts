/**
 * Opens a command in the user's terminal, used by "Open in herdr" to attach a terminal tab to the
 * bots' herdr session. The choice of terminal and the commands that drive it are pure functions; only
 * `openInTerminal` touches the system.
 */
import { execFile } from "node:child_process";
import { attachedTtys, focusGhosttyScript, focusTabScript, paneForTtys } from "./existing-tab.ts";

export const TERMINALS = ["kaku", "wezterm", "ghostty", "iterm", "terminal"] as const;
export type Terminal = (typeof TERMINALS)[number];
/** A setting value: a specific terminal, or `null` to pick one automatically. */
export type TerminalChoice = Terminal | null;

export function isTerminal(value: unknown): value is Terminal {
  return typeof value === "string" && (TERMINALS as readonly string[]).includes(value);
}

interface TerminalApp {
  readonly appName: string;
  /** A fragment of the app's executable path, used to tell whether it is running. */
  readonly processMarker: string;
}

const APPS: Readonly<Record<Terminal, TerminalApp>> = {
  kaku: { appName: "Kaku", processMarker: "/Kaku.app/" },
  wezterm: { appName: "WezTerm", processMarker: "/WezTerm.app/" },
  ghostty: { appName: "Ghostty", processMarker: "/Ghostty.app/" },
  iterm: { appName: "iTerm", processMarker: "/iTerm.app/" },
  terminal: { appName: "Terminal", processMarker: "/Terminal.app/" },
};

/** The terminal to use: the chosen one, or else the first running terminal in `TERMINALS` order, or else macOS Terminal. */
export function pickTerminal(choice: TerminalChoice, runningProcesses: readonly string[]): Terminal {
  if (choice != null) return choice;
  return TERMINALS.find((terminal) => runningProcesses.some((path) => path.includes(APPS[terminal].processMarker))) ?? "terminal";
}

export function isRunning(terminal: Terminal, runningProcesses: readonly string[]): boolean {
  return runningProcesses.some((path) => path.includes(APPS[terminal].processMarker));
}

/** Quotes one argument for a POSIX shell. */
export function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

function appleScriptString(text: string): string {
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * The environment for the launched terminal. herdr marks every pane it runs (HERDR_ENV, the pane's
 * socket, ...), and an app started from such a pane inherits that; Kaku and WezTerm then forward it
 * into the new tab, where herdr refuses to attach ("nested herdr is disabled").
 */
export function terminalEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("HERDR_")));
}

/**
 * Runs `commandLine` with herdr's pane variables cleared. A terminal app that was itself started from
 * a herdr pane passes them to every tab it opens, whatever environment we launch it with.
 */
export function withoutHerdrEnv(commandLine: string): string {
  return `unset $(env | sed -n 's/^\\(HERDR_[A-Za-z0-9_]*\\)=.*/\\1/p'); ${commandLine}`;
}

/** Keeps the tab open with the exit status when the command fails, instead of it closing before anyone can read the error. */
export function keepOpenOnFailure(commandLine: string): string {
  return `${commandLine} || { rc=$?; printf '\\n[herdr-bot] The command failed (exit %s). Press Enter to close.' "$rc"; read -r _; }`;
}

export interface Step {
  readonly file: string;
  readonly args: readonly string[];
}

export interface LaunchPlan {
  readonly terminal: Terminal;
  readonly running: boolean;
  /** The command line, already quoted for a shell. */
  readonly commandLine: string;
  /** The user's login shell, so the command sees the same PATH as in their own terminal. */
  readonly shell: string;
  /** The executable inside the app bundle, for terminals driven by their own CLI (Kaku, WezTerm). */
  readonly cliPath?: string;
}

/** The commands that open `commandLine` in a new tab (a new window in Terminal, which cannot add a tab). */
export function launchSteps(plan: LaunchPlan): readonly Step[] {
  const { appName } = APPS[plan.terminal];
  const shellCommand = [plan.shell, "-lc", plan.commandLine];
  switch (plan.terminal) {
    case "kaku":
    case "wezterm": {
      const cli = plan.cliPath ?? (plan.terminal === "kaku" ? "kaku" : "wezterm");
      if (!plan.running) return [{ file: "open", args: ["-a", appName, "--args", "start", "--", ...shellCommand] }];
      return [
        { file: cli, args: ["cli", "spawn", "--", ...shellCommand] },
        { file: "open", args: ["-a", appName] },
      ];
    }
    case "ghostty": {
      const command = appleScriptString(shellCommand.map(shellQuote).join(" "));
      const script = [
        'tell application "Ghostty"',
        "  set config to new surface configuration",
        `  set command of config to ${command}`,
        "  if (count of windows) = 0 then",
        "    new window with configuration config",
        "  else",
        "    new tab in front window with configuration config",
        "  end if",
        "  activate",
        "end tell",
      ].join("\n");
      return [{ file: "osascript", args: ["-e", script] }];
    }
    case "iterm": {
      const command = appleScriptString(shellCommand.map(shellQuote).join(" "));
      const script = [
        'tell application "iTerm"',
        "  activate",
        "  if (count of windows) = 0 then",
        `    create window with default profile command ${command}`,
        "  else",
        `    tell current window to create tab with default profile command ${command}`,
        "  end if",
        "end tell",
      ].join("\n");
      return [{ file: "osascript", args: ["-e", script] }];
    }
    case "terminal": {
      const script = ['tell application "Terminal"', "  activate", `  do script ${appleScriptString(plan.commandLine)}`, "end tell"].join("\n");
      return [{ file: "osascript", args: ["-e", script] }];
    }
  }
}

function run(file: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: 15_000, env: terminalEnv(process.env) }, (error, stdout, stderr) => {
      if (error != null) reject(new Error(`${file} failed: ${stderr.trim() || error.message}`));
      else resolve(stdout);
    });
  });
}

/** `ps` output as "tty args" lines: the args say which terminals run, the TTY where a command runs. */
async function processTable(): Promise<string> {
  return run("ps", ["-axo", "tty=,args="]);
}

async function bundleExecutable(terminal: Terminal): Promise<string | undefined> {
  if (terminal !== "kaku" && terminal !== "wezterm") return undefined;
  try {
    const appPath = (await run("osascript", ["-e", `POSIX path of (path to application ${appleScriptString(APPS[terminal].appName)})`])).trim();
    return `${appPath.replace(/\/$/, "")}/Contents/MacOS/${terminal}`;
  } catch {
    return undefined;
  }
}

/** Brings forward the tab of `terminal` attached to the session (see existing-tab.ts); false when it has none. */
async function focusExistingTab(terminal: Terminal, ttys: readonly string[], herdrSession: string | undefined): Promise<boolean> {
  try {
    if (terminal === "kaku" || terminal === "wezterm") {
      const cli = (await bundleExecutable(terminal)) ?? terminal;
      const paneId = paneForTtys(await run(cli, ["cli", "--no-auto-start", "list", "--format", "json"]), ttys);
      if (paneId == null) return false;
      await run(cli, ["cli", "activate-pane", "--pane-id", String(paneId)]);
      await run("open", ["-a", APPS[terminal].appName]);
      return true;
    }
    if (terminal === "iterm" || terminal === "terminal") {
      return (await run("osascript", ["-e", focusTabScript(terminal, ttys)])).trim() === "found";
    }
    if (herdrSession == null) return false;
    return (await run("osascript", ["-e", focusGhosttyScript(herdrSession)])).trim() === "found";
  } catch {
    return false;
  }
}

export interface OpenResult {
  readonly terminal: Terminal;
  /** True when a tab already running `command` was brought forward instead of opening a new one. */
  readonly reused: boolean;
}

/**
 * Brings forward a tab that is already running `command`, in any running terminal (the chosen one
 * first); otherwise runs it in a new tab of the chosen (or detected) terminal.
 */
export interface OpenOptions {
  /** The herdr session `command` attaches to, for terminals that can only recognise its tab by title (Ghostty). */
  readonly herdrSession?: string;
}

export async function openInTerminal(choice: TerminalChoice, command: readonly string[], options: OpenOptions = {}): Promise<OpenResult> {
  const table = await processTable();
  const processes = table.split("\n");
  const terminal = pickTerminal(choice, processes);
  const ttys = attachedTtys(table, command);
  if (ttys.length > 0) {
    const candidates = [terminal, ...TERMINALS.filter((other) => other !== terminal)].filter((candidate) => isRunning(candidate, processes));
    for (const candidate of candidates) {
      if (await focusExistingTab(candidate, ttys, options.herdrSession)) return { terminal: candidate, reused: true };
    }
  }
  const cliPath = await bundleExecutable(terminal);
  const plan: LaunchPlan = {
    terminal,
    running: isRunning(terminal, processes),
    commandLine: keepOpenOnFailure(withoutHerdrEnv(command.map(shellQuote).join(" "))),
    shell: process.env.SHELL ?? "/bin/zsh",
    ...(cliPath == null ? {} : { cliPath }),
  };
  for (const step of launchSteps(plan)) await run(step.file, step.args);
  return { terminal, reused: false };
}
