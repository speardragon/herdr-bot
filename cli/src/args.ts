export type CliOutput = "json" | "transcript";

export type CliCommand =
  | { readonly kind: "control"; readonly method: string; readonly params: Record<string, unknown>; readonly output: CliOutput }
  | { readonly kind: "serve" }
  | { readonly kind: "install-shim" };

export type CliParse = CliCommand | { readonly error: string };

const USAGE = "usage: herdr-bot <say|pass|read|rooms|whoami|send|bot|room|status|serve|install-shim> ...";

function flags(argv: readonly string[]): { positional: string[]; options: Record<string, string> } {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token.startsWith("--")) {
      options[token.slice(2)] = argv[index + 1] ?? "";
      index += 1;
    } else {
      positional.push(token);
    }
  }
  return { positional, options };
}

function control(method: string, params: Record<string, unknown>, output: CliOutput = "json"): CliCommand {
  return { kind: "control", method, params, output };
}

function withOptional(params: Record<string, unknown>, options: Record<string, string>, mapping: Record<string, string>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [flag, key] of Object.entries(mapping)) if (options[flag] != null && options[flag].length > 0) extra[key] = options[flag];
  return { ...params, ...extra };
}

function parseBot(argv: readonly string[]): CliParse {
  const [sub, ...rest] = argv;
  const { positional, options } = flags(rest);
  switch (sub) {
    case "create": {
      const id = positional[0];
      if (id == null) return { error: "bot create needs <id>" };
      return control("bot.create", withOptional({ id, name: options.name ?? id }, options, { kind: "kind", cwd: "cwd", permission: "permissionMode", description: "description" }));
    }
    case "adopt": {
      const [paneId, id] = positional;
      if (paneId == null || id == null) return { error: "bot adopt needs <paneId> and <id>" };
      return control("bot.adopt", withOptional({ paneId, id, name: options.name ?? id }, options, { description: "description" }));
    }
    case "list": return control("bot.list", {});
    case "adoptable": return control("bot.adoptable", {});
    case "delete": return positional[0] == null ? { error: "bot delete needs <id>" } : control("bot.delete", { id: positional[0] });
    default: return { error: "usage: herdr-bot bot <create|adopt|list|adoptable|delete>" };
  }
}

function parseRoom(argv: readonly string[]): CliParse {
  const [sub, ...rest] = argv;
  const { positional, options } = flags(rest);
  if (sub === "create") {
    const name = positional[0];
    if (name == null) return { error: "room create needs <name>" };
    const memberIds = (options.members ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    return control("room.create", withOptional({ name, memberIds }, options, { description: "description" }));
  }
  if (sub === "members") {
    const [id, list] = positional;
    if (id == null || list == null) return { error: "room members needs <roomId> and <a,b,...>" };
    return control("room.set-members", { id, memberIds: list.split(",").map((s) => s.trim()).filter((s) => s.length > 0) });
  }
  return { error: "usage: herdr-bot room <create|members>" };
}

export function parseCliArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): CliParse {
  const [command, ...rest] = argv;
  const paneId = env.HERDR_PANE_ID ?? "";
  switch (command) {
    case undefined: return { error: USAGE };
    case "say": {
      const [chatId, ...words] = rest;
      if (chatId == null || words.length === 0) return { error: "say needs <chatId> and <text>" };
      return control("say", { chatId, text: words.join(" "), paneId });
    }
    case "pass": return rest[0] == null ? { error: "pass needs <chatId>" } : control("pass", { chatId: rest[0], paneId });
    case "read": {
      const { positional, options } = flags(rest);
      if (positional[0] == null) return { error: "read needs <chatId>" };
      const limit = options.limit == null ? undefined : Number.parseInt(options.limit, 10);
      return control("read", { chatId: positional[0], ...(limit == null || Number.isNaN(limit) ? {} : { limit }) }, "transcript");
    }
    case "rooms": return control("rooms", {});
    case "whoami": return control("whoami", { paneId });
    case "status": return control("status", {});
    case "send": {
      const [chatId, ...words] = rest;
      if (chatId == null || words.length === 0) return { error: "send needs <chatId> and <text>" };
      return control("send", { chatId, text: words.join(" ") });
    }
    case "bot": return parseBot(rest);
    case "room": return parseRoom(rest);
    case "serve": return { kind: "serve" };
    case "install-shim": return { kind: "install-shim" };
    default: return { error: `unknown command "${command}"` };
  }
}
