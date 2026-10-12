import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { keepOpenOnFailure, launchSteps, pickTerminal, shellQuote, terminalEnv, withoutHerdrEnv, type LaunchPlan, type OpenOptions, type TerminalChoice } from "../src/terminal/open-terminal.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

const KAKU = "/Applications/Kaku.app/Contents/MacOS/kaku-gui";
const ITERM = "/Applications/iTerm.app/Contents/MacOS/iTerm2";

test("pickTerminal: an explicit choice wins over whatever is running", () => {
  assert.equal(pickTerminal("ghostty", [KAKU]), "ghostty");
});

test("pickTerminal: automatic picks a running terminal, else macOS Terminal", () => {
  assert.equal(pickTerminal(null, ["/usr/sbin/cfprefsd", ITERM]), "iterm");
  assert.equal(pickTerminal(null, [ITERM, KAKU]), "kaku");
  assert.equal(pickTerminal(null, ["/usr/sbin/cfprefsd"]), "terminal");
});

test("shellQuote leaves plain words alone and single-quotes the rest", () => {
  assert.equal(shellQuote("/opt/homebrew/bin/herdr"), "/opt/homebrew/bin/herdr");
  assert.equal(shellQuote("my session"), "'my session'");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
});

const plan = (overrides: Partial<LaunchPlan>): LaunchPlan => ({ terminal: "kaku", running: true, commandLine: "herdr session attach herdr-bot", shell: "/bin/zsh", ...overrides });

test("launchSteps: a running Kaku gets a new tab through its CLI, then comes to the front", () => {
  assert.deepEqual(launchSteps(plan({ cliPath: "/Applications/Kaku.app/Contents/MacOS/kaku" })), [
    { file: "/Applications/Kaku.app/Contents/MacOS/kaku", args: ["cli", "spawn", "--", "/bin/zsh", "-lc", "herdr session attach herdr-bot"] },
    { file: "open", args: ["-a", "Kaku"] },
  ]);
});

test("launchSteps: a WezTerm that is not running is started with the command", () => {
  assert.deepEqual(launchSteps(plan({ terminal: "wezterm", running: false })), [
    { file: "open", args: ["-a", "WezTerm", "--args", "start", "--", "/bin/zsh", "-lc", "herdr session attach herdr-bot"] },
  ]);
});

test("launchSteps: Ghostty gets a new tab through AppleScript, or a window when it has none", () => {
  const [ghostty] = launchSteps(plan({ terminal: "ghostty" }));
  assert.equal(ghostty?.file, "osascript");
  assert.match(ghostty?.args[1] ?? "", /set command of config to "\/bin\/zsh -lc 'herdr session attach herdr-bot'"/);
  assert.match(ghostty?.args[1] ?? "", /new tab in front window with configuration config/);
  assert.match(ghostty?.args[1] ?? "", /new window with configuration config/);
});

test("withoutHerdrEnv clears herdr's variables inside the tab before running the command", () => {
  assert.equal(withoutHerdrEnv("herdr session attach x"), "unset $(env | sed -n 's/^\\(HERDR_[A-Za-z0-9_]*\\)=.*/\\1/p'); herdr session attach x");
});

test("launchSteps: iTerm2 and Terminal are driven through AppleScript", () => {
  const [iterm] = launchSteps(plan({ terminal: "iterm" }));
  assert.equal(iterm?.file, "osascript");
  assert.match(iterm?.args[1] ?? "", /create tab with default profile command "\/bin\/zsh -lc 'herdr session attach herdr-bot'"/);
  const [terminal] = launchSteps(plan({ terminal: "terminal" }));
  assert.match(terminal?.args[1] ?? "", /do script "herdr session attach herdr-bot"/);
});

test("attachSessionInTerminal attaches the bots' session in the terminal from the app settings", async () => {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [] });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_SESSION: "bots" });
  const calls: { choice: TerminalChoice; command: readonly string[]; options: OpenOptions }[] = [];
  const host = createHost(config, {
    cli: createHerdrCli(fake.binPath, fake.env),
    socketPath: null,
    ensureSession: null,
    openInTerminal: async (choice, command, options) => {
      calls.push({ choice, command, options });
    },
  });
  try {
    await host.attachSessionInTerminal();
    host.roster.updateAppSettings({ terminal: "iterm" });
    await host.attachSessionInTerminal();
    assert.deepEqual(calls, [
      { choice: null, command: [fake.binPath, "session", "attach", "bots"], options: { herdrSession: "bots" } },
      { choice: "iterm", command: [fake.binPath, "session", "attach", "bots"], options: { herdrSession: "bots" } },
    ]);
  } finally {
    temp.cleanup();
  }
});

test("terminalEnv drops herdr's pane variables, so the new tab is not treated as nested herdr", () => {
  const env = terminalEnv({ HOME: "/Users/me", HERDR_ENV: "1", HERDR_SOCKET_PATH: "/x.sock", HERDR_PANE_ID: "w1:p1", PATH: "/usr/bin" });
  assert.deepEqual(env, { HOME: "/Users/me", PATH: "/usr/bin" });
});

test("keepOpenOnFailure leaves a failed command's tab open until Enter", () => {
  const line = keepOpenOnFailure("herdr session attach herdr-bot");
  assert.ok(line.startsWith("herdr session attach herdr-bot || {"));
  assert.match(line, /read -r _; }$/);
});
