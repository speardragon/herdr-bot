// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3304565 (agent.v1.ShellToolCall)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3336849 (agent.v1.EditResult)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3837426 (agent.v1.WriteArgs)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2920347 (agent.v1.ShellResult)

export type ToolResultCardKind = "file-edit" | "file-write" | "shell";
export type ToolResultCardStatus = "running" | "success" | "error" | "denied" | "rejected" | "cancelled" | "background";

export interface ToolResultCardSnapshot {
  kind: ToolResultCardKind;
  toolCallId: string | null;
  status: ToolResultCardStatus;
  path: string | null;
  command: string | null;
  workingDirectory: string | null;
  summary: string;
  output: string;
  diff: string;
  isStreaming: boolean;
  isBackground: boolean;
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): RecordValue | null {
  return isRecord(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = stringValue(value);
    if (candidate != null) return candidate;
  }
  return null;
}

function unwrapResult(value: RecordValue | null): RecordValue | null {
  const result = record(value?.result);
  if (result == null) return value;
  const oneof = Object.values(result).find((candidate) => isRecord(candidate));
  return record(oneof) ?? result;
}

function branch(value: RecordValue | null, ...names: string[]): RecordValue | null {
  if (value == null) return null;
  for (const name of names) {
    const candidate = record(value[name]);
    if (candidate != null) return candidate;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replaceAll("\r\n", "\n").replaceAll("\r", "\n") : "";
}

function explicitStatus(value: RecordValue | null): ToolResultCardStatus | null {
  const status = stringValue(value?.status)?.toLowerCase();
  switch (status) {
    case "running": case "streaming": case "pending": return "running";
    case "success": case "done": case "completed": case "exited": return "success";
    case "background": case "backgrounded": return "background";
    case "denied": case "permission-denied": case "permission_denied": return "denied";
    case "rejected": case "declined": return "rejected";
    case "cancelled": case "canceled": case "aborted": return "cancelled";
    case "error": case "failed": case "failure": case "timeout": return "error";
    default: return null;
  }
}

function detectKind(value: RecordValue, args: RecordValue | null, result: RecordValue | null): ToolResultCardKind | null {
  const hint = firstString(value.kind, value.tool, value.toolName, value.tool_name)?.toLowerCase() ?? "";
  if (hint.includes("shell") || hint.includes("bash") || hint.includes("terminal")) return "shell";
  if (hint.includes("write")) return "file-write";
  if (hint.includes("edit")) return "file-edit";
  if (stringValue(args?.command) != null || stringValue(value.command) != null) return "shell";
  if (stringValue(args?.fileText) != null || stringValue(args?.file_text) != null || result?.linesCreated != null || result?.lines_created != null) return "file-write";
  if (args?.edits != null || args?.streamContent != null || args?.stream_content != null || result?.diffString != null || result?.diff_string != null || result?.linesAdded != null || result?.lines_added != null) return "file-edit";
  return null;
}

function branchStatus(kind: ToolResultCardKind, result: RecordValue | null): ToolResultCardStatus | null {
  if (result == null) return null;
  if (kind === "shell") {
    if (result.permission_denied != null || result.permissionDenied != null) return "denied";
    if (result.rejected != null) return "rejected";
    const failure = branch(result, "failure");
    if (failure != null && (booleanValue(failure.aborted) || stringValue(failure.abortReason) != null || stringValue(failure.abort_reason) != null)) return "cancelled";
    if (result.timeout != null || result.spawn_error != null || result.spawnError != null || result.failure != null) return "error";
    if (result.success != null) return booleanValue(result.is_background) || booleanValue(result.isBackground) ? "background" : "success";
  } else {
    if (result.permission_denied != null || result.permissionDenied != null || result.read_permission_denied != null || result.readPermissionDenied != null || result.write_permission_denied != null || result.writePermissionDenied != null) return "denied";
    if (result.rejected != null) return "rejected";
    if (result.error != null || result.file_not_found != null || result.fileNotFound != null || result.no_space != null || result.noSpace != null) return "error";
    if (result.success != null) return "success";
  }
  return null;
}

function branchPayload(result: RecordValue | null): RecordValue | null {
  if (result == null) return null;
  return branch(result, "success", "failure", "timeout", "rejected", "permission_denied", "permissionDenied", "error", "spawn_error", "spawnError", "no_space", "noSpace", "file_not_found", "fileNotFound", "read_permission_denied", "readPermissionDenied", "write_permission_denied", "writePermissionDenied");
}

function outputFor(kind: ToolResultCardKind, result: RecordValue | null, value: RecordValue): string {
  const payload = branchPayload(result);
  if (kind === "shell") return text(firstString(payload?.interleavedOutput, payload?.interleaved_output, payload?.stdout, payload?.stderr, value.output, value.contents));
  return text(firstString(payload?.output, payload?.message, value.output));
}

function diffFor(result: RecordValue | null, value: RecordValue): string {
  const payload = branchPayload(result);
  return text(firstString(payload?.diffString, payload?.diff_string, payload?.diff, payload?.patch, value.diff, value.diff_string));
}

function summaryFor(result: RecordValue | null, value: RecordValue): string {
  const payload = branchPayload(result);
  return firstString(payload?.error, payload?.reason, payload?.message, value.summary, value.error, value.reason) ?? "";
}

export function projectToolResultCard(value: unknown, hints: { kind?: ToolResultCardKind; toolCallId?: string } = {}): ToolResultCardSnapshot | null {
  const input = record(value);
  if (input == null) return null;
  const args = record(input.args);
  const result = record(input.result) ?? input;
  const kind = hints.kind ?? detectKind(input, args, result);
  if (kind == null) return null;
  const payload = branchPayload(result);
  const toolCallId = firstString(hints.toolCallId, input.toolCallId, input.tool_call_id, args?.toolCallId, args?.tool_call_id);
  const command = kind === "shell" ? firstString(input.command, args?.command, payload?.command) : null;
  const path = kind === "shell" ? null : firstString(input.path, args?.path, payload?.path);
  const workingDirectory = kind === "shell" ? firstString(input.workingDirectory, input.working_directory, args?.workingDirectory, args?.working_directory, payload?.workingDirectory, payload?.working_directory) : null;
  const isBackground = booleanValue(input.isBackground) || booleanValue(input.is_background) || booleanValue(args?.isBackground) || booleanValue(args?.is_background) || booleanValue(result?.isBackground) || booleanValue(result?.is_background) || result?.backgrounded != null;
  const stream = record(input.delta) ?? record(input.stream) ?? input;
  const streamOutput = kind === "shell" ? text(firstString(stream.stdoutDelta, stream.stdout_delta, stream.stderrDelta, stream.stderr_delta, record(stream.stdout)?.content, record(stream.stderr)?.content)) : text(firstString(input.streamContentDelta, input.stream_content_delta));
  const mappedStatus = explicitStatus(input) ?? branchStatus(kind, result);
  const status = mappedStatus === "success" && isBackground ? "background" : mappedStatus ?? (result === input && branchPayload(result) == null || streamOutput.length > 0 ? "running" : "error");
  return {
    kind,
    toolCallId,
    status,
    path,
    command,
    workingDirectory,
    summary: summaryFor(result, input),
    output: streamOutput.length > 0 ? streamOutput : outputFor(kind, result, input),
    diff: diffFor(result, input),
    isStreaming: booleanValue(input.isStreaming) || booleanValue(input.is_streaming) || streamOutput.length > 0 || result == null,
    isBackground
  };
}

export function mergeToolResultCard(previous: ToolResultCardSnapshot, update: unknown): ToolResultCardSnapshot {
  const next = projectToolResultCard(update, { kind: previous.kind, toolCallId: previous.toolCallId ?? undefined });
  if (next == null) return previous;
  const isDelta = next.isStreaming && next.output.length > 0 && (record(update)?.delta != null || record(update)?.stream != null || record(update)?.stdout_delta != null || record(update)?.stderr_delta != null || record(update)?.stream_content_delta != null);
  return {
    ...next,
    output: isDelta ? `${previous.output}${next.output}` : next.output || previous.output,
    diff: next.diff || previous.diff,
    toolCallId: next.toolCallId ?? previous.toolCallId
  };
}
