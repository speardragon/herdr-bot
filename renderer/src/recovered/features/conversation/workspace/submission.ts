/**
 * The shipped send journal owns optimistic send, offline queueing, reconnect
 * flush, and stale-generation fencing around the coordinator send boundary.
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5674804
 */

export type ComposerSubmissionPhase = "pending" | "queued" | "failed" | "sent" | "cancelled";

export interface ComposerSubmission {
  nonce: string;
  agentId: string;
  prompt: string;
  /** Serialized Tiptap JSON; absent for an empty/plain compatibility draft. */
  richText?: string;
  attachments: readonly { path: string; name: string }[];
  createdAtMs: number;
  replyToId?: string;
  isFork?: boolean;
}

export interface ComposerSubmissionRecord extends ComposerSubmission {
  phase: Exclude<ComposerSubmissionPhase, "cancelled">;
}

export interface ComposerSubmissionQueue {
  submit(input: ComposerSubmission): { nonce: string; completion: Promise<ComposerSubmissionPhase> };
  discard(nonce: string): void;
  cancelQueued(nonce: string): boolean;
  flush(): void;
  snapshot(): readonly ComposerSubmissionRecord[];
  dispose(): void;
}

interface QueueOptions {
  isTransportDown(): boolean;
  send(input: ComposerSubmission): Promise<void>;
  now?(): number;
  onPhase?(input: ComposerSubmission & { phase: ComposerSubmissionPhase }): void;
  onFailure?(input: ComposerSubmissionRecord, error: unknown): void;
}

interface PendingRecord {
  input: ComposerSubmission;
  phase: Exclude<ComposerSubmissionPhase, "cancelled">;
  resolve(value: ComposerSubmissionPhase): void;
  completion: Promise<ComposerSubmissionPhase>;
}

/**
 * Small renderer-side boundary around the coordinator's sendPrompt contract.
 * It intentionally does not invent a stop-generation method: only queued
 * sends can be cancelled because that is the action exposed by the shipped
 * send journal and the current coordinator contract.
 */
export function createComposerSubmissionQueue(options: QueueOptions): ComposerSubmissionQueue {
  const records = new Map<string, PendingRecord>();
  const activeByAgent = new Map<string, string>();
  let generation = 0;
  let disposed = false;

  const notify = (record: PendingRecord, phase: PendingRecord["phase"]) => {
    record.phase = phase;
    options.onPhase?.({ ...record.input, phase });
  };

  const finish = (record: PendingRecord, phase: ComposerSubmissionPhase) => {
    if (records.get(record.input.nonce) !== record) return;
    if (phase === "sent" || phase === "cancelled") records.delete(record.input.nonce);
    if (activeByAgent.get(record.input.agentId) === record.input.nonce) activeByAgent.delete(record.input.agentId);
    record.resolve(phase);
    if (phase !== "cancelled") options.onPhase?.({ ...record.input, phase });
  };

  const run = (record: PendingRecord, runGeneration: number) => {
    if (disposed || generation !== runGeneration || records.get(record.input.nonce) !== record) return;
    if (options.isTransportDown()) {
      notify(record, "queued");
      return;
    }
    activeByAgent.set(record.input.agentId, record.input.nonce);
    notify(record, "pending");
    void options.send(record.input).then(() => {
      if (disposed || generation !== runGeneration || records.get(record.input.nonce) !== record) return;
      finish(record, "sent");
      flushAgent(record.input.agentId, runGeneration);
    }).catch((error: unknown) => {
      if (disposed || generation !== runGeneration || records.get(record.input.nonce) !== record) return;
      notify(record, "failed");
      if (activeByAgent.get(record.input.agentId) === record.input.nonce) activeByAgent.delete(record.input.agentId);
      record.resolve("failed");
      options.onFailure?.({ ...record.input, phase: "failed" }, error);
    });
  };

  const flushAgent = (agentId: string, runGeneration: number) => {
    if (disposed || generation !== runGeneration || options.isTransportDown() || activeByAgent.has(agentId)) return;
    const next = [...records.values()].find((record) => record.input.agentId === agentId && record.phase === "queued");
    if (next != null) run(next, runGeneration);
  };

  const flush = () => {
    if (disposed || options.isTransportDown()) return;
    const runGeneration = generation;
    for (const record of records.values()) {
      if (record.phase === "queued" && !activeByAgent.has(record.input.agentId)) flushAgent(record.input.agentId, runGeneration);
    }
  };

  return {
    submit(input) {
      if (disposed) return { nonce: input.nonce, completion: Promise.resolve("cancelled") };
      let resolve!: (value: ComposerSubmissionPhase) => void;
      const completion = new Promise<ComposerSubmissionPhase>((done) => { resolve = done; });
      const record: PendingRecord = { input, phase: "pending", resolve, completion };
      records.set(input.nonce, record);
      const queued = options.isTransportDown() || activeByAgent.has(input.agentId);
      if (queued) notify(record, "queued");
      else run(record, generation);
      return { nonce: input.nonce, completion };
    },
    discard(nonce) {
      const record = records.get(nonce);
      if (record == null || record.phase !== "failed") return;
      records.delete(nonce);
      record.resolve("cancelled");
    },
    cancelQueued(nonce) {
      const record = records.get(nonce);
      if (record == null || record.phase !== "queued") return false;
      records.delete(nonce);
      record.resolve("cancelled");
      options.onPhase?.({ ...record.input, phase: "cancelled" });
      return true;
    },
    flush,
    snapshot() {
      return [...records.values()].map((record) => ({ ...record.input, phase: record.phase }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      activeByAgent.clear();
      for (const record of records.values()) record.resolve("cancelled");
      records.clear();
    }
  };
}
