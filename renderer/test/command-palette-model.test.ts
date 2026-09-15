import { test } from "node:test";
import assert from "node:assert/strict";
import { paletteAgentSubtitle, paletteFileIconName, paletteVisibleCommands } from "../src/production/command-palette-row-model.ts";
import type { CommandPaletteAgent, CommandPaletteCommand } from "../src/production/command-palette-model.ts";

// herdr-bot: CommandPalette.tsx is presentational (no DOM harness in this repo), so the row
// projection it renders -- subtitle text and which root commands appear, in what order -- is
// extracted here and locked to the Grok Bot reference layout.

const AGENTS: readonly CommandPaletteAgent[] = [
  { id: "code-bot", name: "aidt-edu-core 코드 봇", isGroup: false, description: "aidt-edu-core 레포의 aidt/master 브랜치를 베이스로 코드 베이스를 관리한다" },
  { id: "apm-bot", name: "APM 확인 봇", isGroup: false, description: "  사용자는 주로 엔지니어링 분야에서 일합니다.\n두 번째 줄은 잘린다.  " },
  { id: "new-bot", name: "새 Bot", isGroup: false, description: "   " },
  { id: "room", name: "창룡 강, aidt-edu-core 코드 봇 및 APM 확인 봇", isGroup: true, memberIds: ["code-bot", "ghost", "apm-bot"] },
];

test("a group's subtitle lists its members' names in memberIds order, skipping ids that are not in the roster", () => {
  assert.equal(paletteAgentSubtitle(AGENTS[3]!, AGENTS), "aidt-edu-core 코드 봇, APM 확인 봇");
});

test("a bot's subtitle is the trimmed first line of its description", () => {
  assert.equal(paletteAgentSubtitle(AGENTS[0]!, AGENTS), "aidt-edu-core 레포의 aidt/master 브랜치를 베이스로 코드 베이스를 관리한다");
  assert.equal(paletteAgentSubtitle(AGENTS[1]!, AGENTS), "사용자는 주로 엔지니어링 분야에서 일합니다.");
});

test("a bot without a description, or a group without resolvable members, has no subtitle", () => {
  assert.equal(paletteAgentSubtitle(AGENTS[2]!, AGENTS), null);
  assert.equal(paletteAgentSubtitle({ id: "empty-room", name: "Empty", isGroup: true, memberIds: ["ghost"] }, AGENTS), null);
  assert.equal(paletteAgentSubtitle({ id: "no-members", name: "No members", isGroup: true }, AGENTS), null);
});

function command(id: string, label = id): CommandPaletteCommand {
  return { id, label, keywords: [], run: () => {} };
}

test("only the current-chat info rows plus New chat / Settings survive, with info rows first (reference order)", () => {
  const all = [
    command("view:org-chart"), command("new:chat", "New chat"), command("misc:noop"), command("info:members", "Members"),
    command("info:channels", "Channels"), command("info:settings", "Chat Settings"), command("settings:general", "Settings: General"),
    command("settings:appearance"), command("overlay:plugins"), command("theme:dark"), command("update:computer"),
  ];
  assert.deepEqual(paletteVisibleCommands(all).map((entry) => entry.id), ["info:members", "info:channels", "info:settings", "new:chat", "settings:general"]);
});

test("every search-provider file kind maps to a registry icon, with a generic file glyph as the floor", () => {
  assert.equal(paletteFileIconName("image"), "image");
  assert.equal(paletteFileIconName("pdf"), "file-pdf");
  assert.equal(paletteFileIconName("table"), "grid");
  assert.equal(paletteFileIconName("file"), "file");
});

test("visible-command projection keeps the original command objects (run callbacks intact) and never mutates the input", () => {
  const settings = command("settings:general");
  const input = [command("theme:dark"), settings];
  const snapshot = [...input];
  const visible = paletteVisibleCommands(input);
  assert.equal(visible[0], settings);
  assert.deepEqual(input, snapshot);
});
