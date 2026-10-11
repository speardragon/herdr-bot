/** Small `invalid_args`-throwing helpers shared by every handler in handlers/*.ts. Params arrive as
 * `unknown` (they crossed a transport boundary) even though AppApiMethods types them -- these narrow
 * and validate at runtime before a handler trusts a field. */
import { AppApiError } from "./errors.ts";

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function str(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.length === 0) throw new AppApiError("invalid_args", `${key} must be a non-empty string`);
  return value;
}

export function optStr(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function num(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function optNum(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function bool(params: Record<string, unknown>, key: string): boolean {
  return params[key] === true;
}

export function strArray(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new AppApiError("invalid_args", `${key} must be an array of strings`);
  return value as string[];
}
