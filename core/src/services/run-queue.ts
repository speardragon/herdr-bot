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
