/**
 * Polls `predicate` until it returns true, or throws once `timeoutMs` elapses.
 *
 * Use this instead of a fixed `setTimeout` sleep whenever a test is waiting on an
 * observable outcome (a state change, a socket subscription, a log line) that is
 * produced by real async I/O (a child process, a socket round-trip). Fixed sleeps
 * are calibrated for an idle machine and flake under full-suite parallel load,
 * where a single child-process spawn can take far longer than expected.
 */
export async function waitFor(predicate: () => boolean, options: { timeoutMs?: number; intervalMs?: number; message?: string } = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const intervalMs = options.intervalMs ?? 5;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() >= deadline) throw new Error(options.message ?? `waitFor: condition not met within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
