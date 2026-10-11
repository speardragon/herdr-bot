import type { PermissionMode } from "../store/profile-store.ts";

/** `herdr agent start --kind` values accepted by herdr 0.9.0. */
export const SUPPORTED_KINDS: readonly string[] = [
  "pi", "claude", "codex", "gemini", "cursor", "devin", "agy", "cline", "omp", "mastracode", "opencode", "copilot",
  "kimi", "kiro", "droid", "amp", "grok", "hermes", "kilo", "qodercli", "qwen", "maki", "muse",
];

export function isSupportedKind(kind: string): boolean {
  return SUPPORTED_KINDS.includes(kind);
}

export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export interface AgentLaunchOptions {
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
}

export interface ProviderLaunchCapabilities {
  readonly model: boolean;
  readonly reasoning: boolean;
}

export function providerLaunchCapabilities(kind: string): ProviderLaunchCapabilities {
  return {
    model: ["claude", "codex", "grok", "gemini", "opencode"].includes(kind),
    reasoning: ["claude", "codex", "grok"].includes(kind),
  };
}

export function launchArgsFor(
  kind: string,
  permissionMode: PermissionMode,
  cliPath: string,
  options: AgentLaunchOptions = { model: null, reasoningEffort: null },
): string[] {
  const capabilities = providerLaunchCapabilities(kind);
  if (options.model != null && !capabilities.model) throw new Error(`${kind} does not support model selection`);
  if (options.reasoningEffort != null && !capabilities.reasoning) throw new Error(`${kind} does not support reasoning effort`);

  const args = kind === "claude"
    ? permissionMode === "auto" ? ["--permission-mode", "bypassPermissions"] : ["--allowedTools", `Bash(${cliPath} *)`]
    : kind === "codex" && permissionMode === "auto" ? ["-s", "workspace-write", "-a", "on-request"] : [];
  if (options.model != null) args.push("--model", options.model);
  if (options.reasoningEffort != null) {
    if (kind === "claude") args.push("--effort", options.reasoningEffort);
    if (kind === "codex") args.push("--config", `model_reasoning_effort="${options.reasoningEffort}"`);
    if (kind === "grok") args.push("--reasoning-effort", options.reasoningEffort);
  }
  return args;
}
