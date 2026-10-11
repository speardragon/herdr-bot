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
    // A child process or poll that is still finishing can briefly re-create a file while the tree is
    // removed (ENOTEMPTY); retrying a few times keeps cleanup from failing the test.
    cleanup: () => rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  };
}
