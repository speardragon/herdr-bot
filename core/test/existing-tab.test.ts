import { test } from "node:test";
import assert from "node:assert/strict";
import { attachedTtys, focusGhosttyScript, focusTabScript, paneForTtys } from "../src/terminal/existing-tab.ts";

const ATTACH = ["/opt/homebrew/bin/herdr", "session", "attach", "herdr-bot"];

test("attachedTtys finds the TTYs running the attach command, typed by hand or by path", () => {
  const ps = [
    "ttys001  -zsh",
    "ttys004  /opt/homebrew/bin/herdr session attach herdr-bot",
    "ttys007  herdr session attach herdr-bot",
    "ttys009  herdr session attach herdr-bot-demo",
    "ttys010  /opt/homebrew/bin/herdr --session herdr-bot server",
    "??       /opt/homebrew/bin/herdr session attach herdr-bot",
    "ttys011  /bin/zsh -lc /opt/homebrew/bin/herdr session attach herdr-bot || { rc=$?; read -r _; }",
  ].join("\n");
  assert.deepEqual(attachedTtys(ps, ATTACH), ["/dev/ttys004", "/dev/ttys007"]);
});

test("paneForTtys picks the Kaku/WezTerm pane that owns an attached TTY", () => {
  const list = JSON.stringify([
    { pane_id: 1, tty_name: "/dev/ttys001" },
    { pane_id: 12, tty_name: "/dev/ttys007" },
  ]);
  assert.equal(paneForTtys(list, ["/dev/ttys007"]), 12);
  assert.equal(paneForTtys(list, ["/dev/ttys099"]), null);
  assert.equal(paneForTtys("not json", ["/dev/ttys007"]), null);
});

test("focusTabScript looks the tab up by TTY in iTerm2 and Terminal", () => {
  const iterm = focusTabScript("iterm", ["/dev/ttys004", "/dev/ttys007"]);
  assert.match(iterm, /tell application "iTerm"/);
  assert.match(iterm, /set wanted to \{"\/dev\/ttys004", "\/dev\/ttys007"\}/);
  assert.match(iterm, /if wanted contains \(tty of s\) then/);
  const terminal = focusTabScript("terminal", ["/dev/ttys004"]);
  assert.match(terminal, /set selected of t to true/);
});

test("focusGhosttyScript finds the attached terminal by the title herdr gives it", () => {
  const script = focusGhosttyScript("herdr-bot");
  assert.match(script, /if title starts with "herdr-bot: " or title contains ": herdr-bot: " then/);
  assert.match(script, /focus term/);
});
