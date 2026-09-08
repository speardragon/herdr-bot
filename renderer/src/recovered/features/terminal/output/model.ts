// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3069755 (TerminalMetadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3206357 (RunTerminalCommandV2Result)

export type TerminalOutputStatus = "idle" | "running" | "exited" | "error";

export interface TerminalOutputSnapshot {
  sessionId: string;
  command: string;
  cwd: string | null;
  output: string;
  status: TerminalOutputStatus;
  exitCode: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeTerminalOutput(value: unknown): string {
  return typeof value === "string" ? value.replaceAll("\r\n", "\n").replaceAll("\r", "\n") : "";
}

export function projectTerminalOutput(value: unknown): TerminalOutputSnapshot | null {
  if (!isRecord(value)) return null;
  const metadata = isRecord(value.metadata) ? value.metadata : null;
  const currentCommand = isRecord(value.currentCommand)
    ? value.currentCommand
    : metadata != null && isRecord(metadata.currentCommand) ? metadata.currentCommand : null;
  const command = stringValue(value.command) ?? stringValue(currentCommand?.command);
  const sessionId = stringValue(value.sessionId)
    ?? numberValue(value.terminalInstanceId)?.toString()
    ?? numberValue(value.terminal_instance_id)?.toString()
    ?? stringValue(value.terminalInstancePath)
    ?? stringValue(value.terminal_instance_path);
  if (command == null || sessionId == null) return null;
  const exitCode = numberValue(value.exitCode ?? value.exit_code);
  const isRunning = value.status === "running" || value.isRunning === true || value.isRunningInBackground === true;
  const isError = value.status === "error" || value.rejected === true || (exitCode != null && exitCode !== 0);
  const status: TerminalOutputStatus = isRunning ? "running" : isError ? "error" : value.status === "idle" ? "idle" : "exited";
  return {
    sessionId,
    command,
    cwd: stringValue(value.cwd) ?? stringValue(value.cwdFull) ?? stringValue(metadata?.cwd),
    output: normalizeTerminalOutput(value.outputRaw ?? value.output_raw ?? value.output ?? value.contents),
    status,
    exitCode
  };
}
