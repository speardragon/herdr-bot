export const COORDINATOR_PROTOCOL_VERSION = 1;
export const COORDINATOR_UNKNOWN_METHOD = "unknown-method";
export const COORDINATOR_CANCELLED = "cancelled";
export const COORDINATOR_INVALID_ARGS = "invalid-args";
export const COORDINATOR_UNSUPPORTED = "unsupported";
export const COORDINATOR_TRANSPORT_STATE_FAMILY = "coordinator-transport-state";

export interface CoordinatorFailure {
  readonly code: string;
  readonly message: string;
  readonly transportKind?: string;
}

export type CoordinatorReplyOutcome =
  | { readonly status: "ok"; readonly value: unknown }
  | { readonly status: "failed"; readonly failure: CoordinatorFailure };

export type CoordinatorFrame =
  | { readonly kind: "lifecycle"; readonly phase: "hello" | "ready"; readonly protocolVersion: number }
  | { readonly kind: "lifecycle"; readonly phase: "shutdown"; readonly reason: "requested" | "protocol-error"; readonly detail: string | null }
  | { readonly kind: "request"; readonly requestId: string; readonly method: string; readonly args: unknown }
  | { readonly kind: "cancel"; readonly requestId: string }
  | { readonly kind: "reply"; readonly requestId: string; readonly outcome: CoordinatorReplyOutcome }
  | { readonly kind: "event"; readonly family: string; readonly payload: unknown };

export type CoordinatorFrameParseResult =
  | { readonly accepted: true; readonly frame: CoordinatorFrame }
  | { readonly accepted: false; readonly rejection: { readonly code: "malformed-frame"; readonly detail: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function reject(detail: string): CoordinatorFrameParseResult {
  return { accepted: false, rejection: { code: "malformed-frame", detail } };
}

function accept(frame: CoordinatorFrame): CoordinatorFrameParseResult {
  return { accepted: true, frame };
}

function parseOutcome(value: unknown): CoordinatorReplyOutcome | null {
  if (!isRecord(value)) return null;
  if (value.status === "ok") return "value" in value ? { status: "ok", value: value.value } : null;
  if (value.status !== "failed" || !isRecord(value.failure)) return null;
  const { code, message, transportKind } = value.failure;
  if (!nonEmptyString(code) || typeof message !== "string") return null;
  return { status: "failed", failure: { code, message, ...(nonEmptyString(transportKind) ? { transportKind } : {}) } };
}

function parseLifecycle(value: Record<string, unknown>): CoordinatorFrameParseResult {
  if (value.phase === "hello" || value.phase === "ready") {
    return typeof value.protocolVersion === "number"
      ? accept({ kind: "lifecycle", phase: value.phase, protocolVersion: value.protocolVersion })
      : reject(`lifecycle.${value.phase}.protocolVersion must be a number`);
  }
  if (value.phase === "shutdown") {
    if (value.reason !== "requested" && value.reason !== "protocol-error") return reject("lifecycle.shutdown.reason must be requested or protocol-error");
    if (value.reason === "protocol-error" && !nonEmptyString(value.detail)) return reject("lifecycle.shutdown.detail must name the breach");
    if (value.reason === "requested" && value.detail !== null) return reject("lifecycle.shutdown.detail must be null for a requested shutdown");
    return accept({ kind: "lifecycle", phase: "shutdown", reason: value.reason, detail: value.detail as string | null });
  }
  return reject("lifecycle.phase must be hello, ready, or shutdown");
}

export function parseCoordinatorFrame(value: unknown): CoordinatorFrameParseResult {
  if (!isRecord(value)) return reject("frame must be an object");
  switch (value.kind) {
    case "lifecycle":
      return parseLifecycle(value);
    case "request":
      if (!nonEmptyString(value.requestId)) return reject("request.requestId must be a non-empty string");
      if (!nonEmptyString(value.method)) return reject("request.method must be a non-empty string");
      if (!("args" in value)) return reject("request.args is missing");
      return accept({ kind: "request", requestId: value.requestId, method: value.method, args: value.args });
    case "cancel":
      return nonEmptyString(value.requestId) ? accept({ kind: "cancel", requestId: value.requestId }) : reject("cancel.requestId must be a non-empty string");
    case "reply": {
      if (!nonEmptyString(value.requestId)) return reject("reply.requestId must be a non-empty string");
      const outcome = parseOutcome(value.outcome);
      return outcome == null ? reject("reply.outcome is not a valid outcome") : accept({ kind: "reply", requestId: value.requestId, outcome });
    }
    case "event":
      if (!nonEmptyString(value.family)) return reject("event.family must be a non-empty string");
      if (!("payload" in value)) return reject("event.payload is missing");
      return accept({ kind: "event", family: value.family, payload: value.payload });
    default:
      return reject("frame.kind must be lifecycle, request, cancel, reply, or event");
  }
}
