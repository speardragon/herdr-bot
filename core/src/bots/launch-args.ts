import type { PermissionMode } from "../store/profile-store.ts";

/** `herdr agent start --kind` values accepted by herdr 0.9.0. */
export const SUPPORTED_KINDS: readonly string[] = [
  "pi", "claude", "codex", "gemini", "cursor", "devin", "agy", "cline", "omp", "mastracode", "opencode", "copilot",
  "kimi", "kiro", "droid", "amp", "grok", "hermes", "kilo", "qodercli", "qwen", "maki", "muse",
];

export function isSupportedKind(kind: string): boolean {
  return SUPPORTED_KINDS.includes(kind);
}

export function launchArgsFor(kind: string, permissionMode: PermissionMode, cliPath: string): string[] {
  if (kind === "claude") {
    return permissionMode === "auto" ? ["--permission-mode", "bypassPermissions"] : ["--allowedTools", `Bash(${cliPath} *)`];
  }
  if (kind === "codex") {
    return permissionMode === "auto" ? ["-s", "workspace-write", "-a", "on-request"] : [];
  }
  return [];
}
