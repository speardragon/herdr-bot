import type { CommandPaletteAgent, CommandPaletteCommand } from "./command-palette-model";
import type { CommandPaletteFileKind } from "./command-palette-search-provider";
import type { SandIconName } from "../recovered/ui/sand-icon-registry";

// herdr-bot: pure row-projection helpers for CommandPalette.tsx, kept in their own module (type-only
// imports) so node:test can load them -- command-palette-model.ts has extensionless runtime imports
// that the test runner cannot resolve. See command-palette-model.test.ts.

/**
 * Second line of a palette row (Grok Bot reference): a group lists its members' names in
 * `memberIds` order (ids missing from the roster are skipped), a bot shows the first line of its
 * description. `null` when there is nothing to show so the row renders as a single centered line.
 */
export function paletteAgentSubtitle(agent: CommandPaletteAgent, roster: readonly CommandPaletteAgent[]): string | null {
  if (agent.isGroup) {
    const byId = new Map(roster.map((candidate) => [candidate.id, candidate.name] as const));
    const names = (agent.memberIds ?? []).map((id) => byId.get(id)).filter((name): name is string => name != null && name.length > 0);
    return names.length === 0 ? null : names.join(", ");
  }
  const firstLine = (agent.description ?? "").split("\n")[0]?.trim() ?? "";
  return firstLine.length === 0 ? null : firstLine;
}

/** Root-command ids the reference palette surfaces, in display order: current-chat info rows first. */
const VISIBLE_COMMAND_RANK: readonly ((id: string) => boolean)[] = [
  (id) => id.startsWith("info:"),
  (id) => id === "new:chat",
  (id) => id === "settings:general",
];

function visibleCommandRank(id: string): number {
  return VISIBLE_COMMAND_RANK.findIndex((matches) => matches(id));
}

/**
 * Which of the root shell's many commands the palette shows, ordered like the reference
 * (멤버 / 채팅 설정 … then New chat, then Settings). Pure: returns a new array of the same
 * command objects so their `run` callbacks stay intact. Sorting is stable, so commands sharing a
 * rank (the `info:*` group) keep the root shell's relative order.
 */
export function paletteVisibleCommands(commands: readonly CommandPaletteCommand[]): CommandPaletteCommand[] {
  return commands
    .filter((command) => visibleCommandRank(command.id) >= 0)
    .sort((left, right) => visibleCommandRank(left.id) - visibleCommandRank(right.id));
}

const FILE_KIND_ICONS: Readonly<Record<CommandPaletteFileKind, SandIconName>> = {
  image: "image",
  video: "play",
  audio: "music",
  pdf: "file-pdf",
  markdown: "markdown",
  table: "grid",
  json: "json",
  text: "file-text",
  document: "note",
  archive: "archive",
  file: "file",
};

/** The registry icon for a file row's leading slot -- `file.kind` is a search-provider enum, not an icon name. */
export function paletteFileIconName(kind: CommandPaletteFileKind): SandIconName {
  return FILE_KIND_ICONS[kind] ?? "file";
}
