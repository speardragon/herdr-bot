import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempHome {
  readonly home: string;
  cleanup(): void;
}

/** Short path on purpose: unix socket paths are capped at 104 bytes on macOS. */
export function makeTempHome(): TempHome {
  const home = mkdtempSync(join(tmpdir(), "hb-"));
  return {
    home,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}
