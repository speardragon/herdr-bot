export interface ControlRequest {
  readonly id: string;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export type ControlResponse =
  | { readonly id: string; readonly result: unknown }
  | { readonly id: string; readonly error: { readonly code: string; readonly message: string } };

export const CONTROL_ERROR_CODES = [
  "unknown_pane", "unknown_chat", "unknown_bot", "not_a_member", "over_cap", "use_say", "bot_not_ready", "invalid_params", "unknown_method",
  "herdr_error", "internal", "connect_failed", "timeout", "host_already_running", "bad_response",
] as const;

export type ControlErrorCode = (typeof CONTROL_ERROR_CODES)[number];

export class ControlError extends Error {
  readonly code: ControlErrorCode;

  constructor(code: ControlErrorCode, message: string) {
    super(message);
    this.name = "ControlError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseControlRequest(line: string): ControlRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.method !== "string" || parsed.method.length === 0) return null;
  return { id: parsed.id, method: parsed.method, params: isRecord(parsed.params) ? parsed.params : {} };
}

export function parseControlResponse(line: string): ControlResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.id !== "string") return null;
  if (isRecord(parsed.error) && typeof parsed.error.code === "string") {
    return { id: parsed.id, error: { code: parsed.error.code, message: typeof parsed.error.message === "string" ? parsed.error.message : "" } };
  }
  return "result" in parsed ? { id: parsed.id, result: parsed.result } : null;
}

export function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.length === 0) throw new ControlError("invalid_params", `${key} must be a non-empty string`);
  return value;
}

export function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function optionalStringArray(params: Record<string, unknown>, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new ControlError("invalid_params", `${key} must be an array of strings`);
  return value as string[];
}
