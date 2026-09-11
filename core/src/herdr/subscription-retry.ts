/** Gates reconnect attempts so a poll cannot bypass the backoff a previous failure earned. */
export class SubscriptionRetry {
  #failures = 0;
  #nextAt = 0;

  canAttempt(now: number): boolean {
    return now >= this.#nextAt;
  }

  fail(now: number): void {
    this.#nextAt = now + Math.min(120_000, 30_000 * 2 ** Math.min(this.#failures++, 2));
  }

  ready(): void {
    this.#failures = 0;
    this.#nextAt = 0;
  }
}
