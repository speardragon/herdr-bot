// Immutable renderer root: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=824380 (Ltt send-journal owner)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=824429 (Ltt clearApprovals dispatch)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5667643 (MHn send-journal lifecycle)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5629651 (PUn approval cleanup bridge)

export interface SendJournalResendInput<JournalEvent> {
  onJournaled?: (event: JournalEvent) => void;
}

export interface SendJournalApprovalPort<
  SendInput,
  ResendInput extends SendJournalResendInput<JournalEvent>,
  DeleteInput,
  CancelInput,
  JournalEvent,
  SendResult = void,
  ResendResult = void,
  DeleteResult = unknown,
  CancelResult = unknown,
> {
  sendPrompt(input: SendInput): Promise<SendResult>;
  resendFailed(input: ResendInput): Promise<ResendResult>;
  deleteFailed(input: DeleteInput): Promise<DeleteResult>;
  cancelQueued(input: CancelInput): Promise<CancelResult>;
}

export interface ApprovalClearPort {
  clearApprovals(): Promise<void>;
}

export type ApprovalClearSnapshot =
  | { status: "idle"; failure: null }
  | { status: "clearing"; failure: null }
  | { status: "failed"; failure: unknown };

export interface SendJournalApprovalLifecycle<
  SendInput,
  ResendInput extends SendJournalResendInput<JournalEvent>,
  DeleteInput,
  CancelInput,
  JournalEvent,
  SendResult = void,
  ResendResult = void,
  DeleteResult = unknown,
  CancelResult = unknown,
> {
  sendPrompt(input: SendInput): Promise<SendResult>;
  resendFailed(input: ResendInput): Promise<ResendResult>;
  deleteFailed(input: DeleteInput): Promise<DeleteResult>;
  cancelQueued(input: CancelInput): Promise<CancelResult>;
  getApprovalClearSnapshot(): ApprovalClearSnapshot;
  subscribe(listener: () => void): () => void;
  /** Fences late clear results when the coordinator changes account. */
  reset(): void;
  /** Releases adapter listeners; the coordinator remains the owner of injected stores. */
  dispose(): void;
}

const IDLE: ApprovalClearSnapshot = { status: "idle", failure: null };

/**
 * The shipped Ltt seam is deliberately small: send-journal owns send state,
 * while this boundary owns only the post-journal approval cleanup dispatch.
 * It does not clear on delete/cancel or invent an agent-switch policy.
 */
export function createSendJournalApprovalLifecycle<
  SendInput,
  ResendInput extends SendJournalResendInput<JournalEvent>,
  DeleteInput,
  CancelInput,
  JournalEvent,
  SendResult = void,
  ResendResult = void,
  DeleteResult = unknown,
  CancelResult = unknown,
>(
  journal: SendJournalApprovalPort<
    SendInput,
    ResendInput,
    DeleteInput,
    CancelInput,
    JournalEvent,
    SendResult,
    ResendResult,
    DeleteResult,
    CancelResult
  >,
  approvals: ApprovalClearPort,
): SendJournalApprovalLifecycle<
  SendInput,
  ResendInput,
  DeleteInput,
  CancelInput,
  JournalEvent,
  SendResult,
  ResendResult,
  DeleteResult,
  CancelResult
> {
  const listeners = new Set<() => void>();
  let snapshot: ApprovalClearSnapshot = IDLE;
  let generation = 0;
  let disposed = false;

  const publish = (next: ApprovalClearSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  const clearAfterJournal = async (runGeneration: number): Promise<void> => {
    if (disposed || generation !== runGeneration) return;
    publish({ status: "clearing", failure: null });
    try {
      await approvals.clearApprovals();
      if (!disposed && generation === runGeneration) publish(IDLE);
    } catch (failure: unknown) {
      if (!disposed && generation === runGeneration) publish({ status: "failed", failure });
    }
  };

  return {
    async sendPrompt(input) {
      const runGeneration = generation;
      const result = await journal.sendPrompt(input);
      // Ltt dispatches only after sendPrompt resolves; clear failures are surfaced
      // as state and do not turn an accepted send into a failed send.
      await clearAfterJournal(runGeneration);
      return result;
    },
    async resendFailed(input) {
      const runGeneration = generation;
      let journaled = false;
      const result = await journal.resendFailed({
        ...input,
        onJournaled: (event: JournalEvent) => {
          journaled = true;
          input.onJournaled?.(event);
        },
      });
      // The shipped seam clears only when resend actually journaled a new entry.
      if (journaled) await clearAfterJournal(runGeneration);
      return result;
    },
    deleteFailed(input) {
      return journal.deleteFailed(input);
    },
    cancelQueued(input) {
      return journal.cancelQueued(input);
    },
    getApprovalClearSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      if (disposed) return;
      generation += 1;
      publish(IDLE);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      listeners.clear();
    },
  };
}
