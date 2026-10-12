/**
 * Finding a terminal tab that is already attached to the bots' session, so "Open in herdr" can bring
 * it forward instead of opening another one. A tab is matched by its TTY: `ps` says which TTY runs
 * the attach command, and each terminal can say which of its tabs owns that TTY. Tab titles are not
 * used, since users can change them. Everything here is pure; open-terminal.ts runs the commands.
 */
import { basename } from "node:path";
import type { Terminal } from "./open-terminal.ts";

/**
 * The TTYs (as `/dev/ttysNNN`) of processes running `command`, from `ps -axo tty=,args=` output.
 * `herdr` matches by name, so `herdr session attach x` typed by hand counts as well as the absolute
 * path the app uses.
 */
export function attachedTtys(psOutput: string, command: readonly string[]): readonly string[] {
  const [bin, ...args] = command;
  if (bin == null) return [];
  const words = [basename(bin), ...args];
  const ttys = new Set<string>();
  for (const line of psOutput.split("\n")) {
    const [tty, ...argv] = line.trim().split(/\s+/);
    if (tty == null || tty === "??" || argv.length < words.length) continue;
    const tail = argv.slice(argv.length - words.length);
    const matches = basename(tail[0] ?? "") === words[0] && tail.slice(1).every((word, i) => word === words[i + 1]);
    if (matches) ttys.add(tty.startsWith("/dev/") ? tty : `/dev/${tty}`);
  }
  return [...ttys];
}

interface WeztermPane {
  readonly pane_id: number;
  readonly tty_name?: string;
}

/** The Kaku/WezTerm pane (from `cli list --format json`) that owns one of `ttys`, if any. */
export function paneForTtys(listJson: string, ttys: readonly string[]): number | null {
  try {
    const panes = JSON.parse(listJson) as readonly WeztermPane[];
    return panes.find((pane) => pane.tty_name != null && ttys.includes(pane.tty_name))?.pane_id ?? null;
  } catch {
    return null;
  }
}

function appleScriptList(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(", ")}}`;
}

/** AppleScript that selects the iTerm2 or Terminal tab owning one of `ttys` and prints "found", or prints nothing. */
export function focusTabScript(terminal: Extract<Terminal, "iterm" | "terminal">, ttys: readonly string[]): string {
  const wanted = appleScriptList(ttys);
  if (terminal === "iterm") {
    return [
      'tell application "iTerm"',
      `  set wanted to ${wanted}`,
      "  repeat with w in windows",
      "    repeat with t in tabs of w",
      "      repeat with s in sessions of t",
      "        if wanted contains (tty of s) then",
      "          select w",
      "          select t",
      "          select s",
      "          activate",
      '          return "found"',
      "        end if",
      "      end repeat",
      "    end repeat",
      "  end repeat",
      "end tell",
    ].join("\n");
  }
  return [
    'tell application "Terminal"',
    `  set wanted to ${wanted}`,
    "  repeat with w in windows",
    "    repeat with t in tabs of w",
    "      if wanted contains (tty of t) then",
    "        set selected of t to true",
    "        set index of w to 1",
    "        activate",
    '        return "found"',
    "      end if",
    "    end repeat",
    "  end repeat",
    "end tell",
  ].join("\n");
}
