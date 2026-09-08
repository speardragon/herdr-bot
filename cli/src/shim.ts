import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function shimScript(nodePath: string, mainPath: string): string {
  return `#!/bin/sh\nexec "${nodePath}" "${mainPath}" "$@"\n`;
}

export function installShim(home: string, nodePath: string, mainPath: string): string {
  const dir = join(home, "bin");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "herdr-bot");
  writeFileSync(path, shimScript(nodePath, mainPath), "utf8");
  chmodSync(path, 0o755);
  return path;
}
