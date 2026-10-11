/** Dependency-free error type shared by the app-api client and server (see types.ts for the code union). */
import type { AppApiErrorCode, AppApiErrorPayload } from "./types.ts";

export class AppApiError extends Error {
  readonly code: AppApiErrorCode;

  constructor(code: AppApiErrorCode, message: string) {
    super(message);
    this.name = "AppApiError";
    this.code = code;
  }

  toPayload(): AppApiErrorPayload {
    return { code: this.code, message: this.message };
  }
}

export function isAppApiError(value: unknown): value is AppApiError {
  return value instanceof AppApiError;
}

function isErrorPayload(value: unknown): value is AppApiErrorPayload {
  return typeof value === "object" && value !== null && typeof (value as { code?: unknown }).code === "string" && typeof (value as { message?: unknown }).message === "string";
}

/** Normalizes whatever a transport rejected with (a thrown `AppApiError`, a plain `{code,message}`
 * payload that crossed a serialization boundary, or an arbitrary error) into an `AppApiError`. */
export function toAppApiError(value: unknown): AppApiError {
  if (isAppApiError(value)) return value;
  if (isErrorPayload(value)) return new AppApiError(value.code, value.message);
  return new AppApiError("internal", value instanceof Error ? value.message : String(value));
}
