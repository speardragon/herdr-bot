/**
 * Opens a command in the user's terminal, used by "Open in herdr" to attach a terminal tab to the
 * bots' herdr session. The choice of terminal and the commands that drive it are pure functions; only
 * `openInTerminal` touches the system.
 */
import { execFile } from "node:child_process";

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

/** The commands that open `commandLine` in a new tab (or a new window, where the terminal has no way to add a tab). */
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
    case "ghostty":
      return [{ file: "open", args: ["-na", appName, "--args", "-e", ...shellCommand] }];
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
    execFile(file, [...args], { timeout: 15_000 }, (error, stdout, stderr) => {
      if (error != null) reject(new Error(`${file} failed: ${stderr.trim() || error.message}`));
      else resolve(stdout);
    });
  });
}

async function runningProcesses(): Promise<readonly string[]> {
  return (await run("ps", ["-axo", "comm="])).split("\n");
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

/** Runs `command` in a new tab of the chosen (or detected) terminal and brings that terminal to the front. */
export async function openInTerminal(choice: TerminalChoice, command: readonly string[]): Promise<Terminal> {
  const processes = await runningProcesses();
  const terminal = pickTerminal(choice, processes);
  const cliPath = await bundleExecutable(terminal);
  const plan: LaunchPlan = {
    terminal,
    running: isRunning(terminal, processes),
    commandLine: command.map(shellQuote).join(" "),
    shell: process.env.SHELL ?? "/bin/zsh",
    ...(cliPath == null ? {} : { cliPath }),
  };
  for (const step of launchSteps(plan)) await run(step.file, step.args);
  return terminal;
}
