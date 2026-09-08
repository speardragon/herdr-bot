interface ChatQueue {
  readonly epoch: number;
  readonly tail: Promise<void>;
  readonly running: number;
}

export class RunQueue {
  #queues = new Map<string, ChatQueue>();

  currentEpoch(chatId: string): number {
    return this.#queues.get(chatId)?.epoch ?? 0;
  }

  nextEpoch(chatId: string): number {
    const current = this.#get(chatId);
    const next = { ...current, epoch: current.epoch + 1 };
    this.#queues.set(chatId, next);
    return next.epoch;
  }

  isRunning(chatId: string): boolean {
    return (this.#queues.get(chatId)?.running ?? 0) > 0;
  }

  /**
   * Forgets this chat so a future schedule() starts clean after e.g. bot/room deletion.
   * If nothing is running, the entry is dropped outright (the common case: deletion happens
   * with no turn in flight, so this is where the leak actually gets fixed). If a run is in
   * flight, only the epoch is bumped: deleting `tail`/`running` out from under that run would
   * corrupt the `running` counter once its `finally` callback re-reads queue state, so instead
   * we leave them intact and just bump the epoch, which makes that run's `isCurrent()` check
   * read false so it stops treating itself as authoritative for the (deleted) chat.
   */
  forget(chatId: string): void {
    const current = this.#queues.get(chatId);
    if (current == null) return;
    if (current.running === 0) {
      this.#queues.delete(chatId);
      return;
    }
    this.#queues.set(chatId, { ...current, epoch: current.epoch + 1 });
  }

  enqueue(chatId: string, run: () => Promise<void>): Promise<void> {
    const current = this.#get(chatId);
    const tail = current.tail.then(run, run).finally(() => {
      const after = this.#get(chatId);
      this.#queues.set(chatId, { ...after, running: after.running - 1 });
    });
    this.#queues.set(chatId, { ...current, tail: tail.catch(() => undefined), running: current.running + 1 });
    return tail;
  }

  #get(chatId: string): ChatQueue {
    return this.#queues.get(chatId) ?? { epoch: 0, tail: Promise.resolve(), running: 0 };
  }
}
