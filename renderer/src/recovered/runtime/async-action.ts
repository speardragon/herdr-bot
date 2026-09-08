import { useCallback, useMemo, useRef, useState } from "react";
import { SourceFailure, type SourceFailureDetail } from "./source-boundary";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=804566 (first-party lr async-action hook)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=1065739 (expanded Mac/Windows carrier of the same hook)

const COMMAND_FAILURE_CODE = "client/command-failed";

export type AsyncAction<Value, Arguments extends readonly unknown[]> = (...args: Arguments) => Value | void | PromiseLike<Value | void>;

export type AsyncActionResult<Value> =
  | { readonly ok: true; readonly value: Awaited<Value> | void }
  | { readonly ok: false; readonly error: unknown };

export type AsyncActionFailure = SourceFailureDetail | {
  readonly code: typeof COMMAND_FAILURE_CODE;
  readonly boundary: "client";
  readonly retry: null;
};

export interface AsyncActionHandle<Value, Arguments extends readonly unknown[]> {
  run(...args: Arguments): Promise<AsyncActionResult<Value>>;
  runOrThrow(...args: Arguments): Promise<Awaited<Value> | void>;
  dispatch(...args: Arguments): void;
  readonly isPending: boolean;
  readonly failure: AsyncActionFailure | null;
}

function normalizeFailure(error: unknown): AsyncActionFailure {
  return error instanceof SourceFailure
    ? error.failure
    : { code: COMMAND_FAILURE_CODE, boundary: "client", retry: null };
}

/**
 * Exact first-party async command lifecycle from the renderer's `lr` hook.
 * Pending state is counted across overlapping calls; only the latest call
 * may publish a failure. The shipped owner has no cancellation or disposal
 * contract, so this boundary intentionally exposes neither.
 */
export function useAsyncAction<Value, Arguments extends readonly unknown[]>(
  action: AsyncAction<Value, Arguments>
): AsyncActionHandle<Value, Arguments> {
  const [pendingCount, setPendingCount] = useState(0);
  const [failure, setFailure] = useState<AsyncActionFailure | null>(null);
  const generation = useRef(0);
  const run = useCallback(async (...args: Arguments): Promise<AsyncActionResult<Value>> => {
    generation.current += 1;
    const currentGeneration = generation.current;
    setFailure(null);
    setPendingCount((current) => current + 1);
    try {
      return { ok: true, value: await action(...args) };
    } catch (error: unknown) {
      if (currentGeneration === generation.current) setFailure(normalizeFailure(error));
      return { ok: false, error };
    } finally {
      setPendingCount((current) => current - 1);
    }
  }, [action]);
  const runOrThrow = useCallback(async (...args: Arguments): Promise<Awaited<Value> | void> => {
    const result = await run(...args);
    if (result.ok) return result.value;
    throw result.error;
  }, [run]);
  const dispatch = useCallback((...args: Arguments): void => {
    run(...args);
  }, [run]);
  return useMemo(() => ({ run, runOrThrow, dispatch, isPending: pendingCount > 0, failure }), [run, runOrThrow, dispatch, pendingCount, failure]);
}
