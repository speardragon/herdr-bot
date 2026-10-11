import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Escapes `value` for safe interpolation inside single quotes in a POSIX sh script (handles spaces,
 * `$`, backticks, and embedded double quotes -- app bundles and user home directories can contain any
 * of these). */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export interface ShimOptions {
  /** The desktop app ships a compiled copy of the CLI and runs it through its own Electron binary
   * (`<execPath>` is `process.execPath`, `<mainPath>` the compiled `dist/cli/src/main.js`) instead of a
   * system `node`; `ELECTRON_RUN_AS_NODE=1` makes that binary behave as plain Node for this one exec. */
  readonly electronRunAsNode?: boolean;
}

export function shimScript(nodePath: string, mainPath: string, home: string, options: ShimOptions = {}): string {
  const prefix = options.electronRunAsNode === true ? "ELECTRON_RUN_AS_NODE=1 " : "";
  return `#!/bin/sh\nexport HERDR_BOT_HOME=${shQuote(home)}\n${prefix}exec ${shQuote(nodePath)} ${shQuote(mainPath)} "$@"\n`;
}

/** Writes (and chmods) `<home>/bin/herdr-bot` only when its content would actually change, so repeated
 * calls -- the desktop app does this on every start -- do not disturb the file's mtime/permissions for
 * no reason. */
export function installShim(home: string, nodePath: string, mainPath: string, options: ShimOptions = {}): string {
  const dir = join(home, "bin");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "herdr-bot");
  const content = shimScript(nodePath, mainPath, home, options);
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (existing !== content) {
    writeFileSync(path, content, "utf8");
    chmodSync(path, 0o755);
  }
  return path;
}
