import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function shimScript(nodePath: string, mainPath: string, home: string): string {
  return `#!/bin/sh\nexport HERDR_BOT_HOME="${home}"\nexec "${nodePath}" "${mainPath}" "$@"\n`;
}

export function installShim(home: string, nodePath: string, mainPath: string): string {
  const dir = join(home, "bin");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "herdr-bot");
  writeFileSync(path, shimScript(nodePath, mainPath, home), "utf8");
  chmodSync(path, 0o755);
  return path;
}
