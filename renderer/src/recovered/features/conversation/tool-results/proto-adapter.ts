import type {
  ClientSideToolV2,
  ClientSideToolV2Call,
  ClientSideToolV2Result,
  EditFileParams,
  EditFileResult,
  EditFileV2Params,
  EditFileV2Result,
  RunTerminalCommandV2Params,
  RunTerminalCommandV2Result,
  ToolResultError
} from "../../../../shared/tools-pb-types";
import type { ToolResultCardSnapshot } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3097937 (ClientSideToolV2Call oneof and toolCallId)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3102316 (ClientSideToolV2Result oneof and toolCallId)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3117998 (EditFileV2Params path/streaming fields)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3120049 (EditFileV2Result fileWasCreated/rejected/diff fields)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3203629 (RunTerminalCommandV2Params command/cwd/background fields)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3206357 (RunTerminalCommandV2Result status/output fields)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3930773 (Windows ClientSideToolV2Call carrier)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3935953 (Windows ClientSideToolV2Result carrier)

type SupportedTool = 7 | 15 | 38;

const CLIENT_SIDE_TOOL_EDIT_FILE = 7 as ClientSideToolV2;
const CLIENT_SIDE_TOOL_RUN_TERMINAL_COMMAND_V2 = 15 as ClientSideToolV2;
const CLIENT_SIDE_TOOL_EDIT_FILE_V2 = 38 as ClientSideToolV2;

export type ClientSideToolUpdate =
  | { kind: "call"; sequence: number; value: ClientSideToolV2Call }
  | { kind: "result"; sequence: number; value: ClientSideToolV2Result };

export interface ClientSideToolResultMergeState {
  readonly call: ClientSideToolV2Call | null;
  readonly snapshot: ToolResultCardSnapshot | null;
  readonly lastSequence: number;
}

const EMPTY_STATE: ClientSideToolResultMergeState = Object.freeze({
  call: null,
  snapshot: null,
  lastSequence: -1
});

function isSupportedTool(tool: ClientSideToolV2): tool is SupportedTool {
  return tool === CLIENT_SIDE_TOOL_EDIT_FILE
    || tool === CLIENT_SIDE_TOOL_RUN_TERMINAL_COMMAND_V2
    || tool === CLIENT_SIDE_TOOL_EDIT_FILE_V2;
}

function nonEmpty(value: string): string | null {
  return value.length > 0 ? value : null;
}

function errorMessage(error: ToolResultError): string {
  return error.clientVisibleErrorMessage;
}

function errorStatus(error: ToolResultError): ToolResultCardSnapshot["status"] {
  return errorMessage(error).startsWith("Permission denied:") ? "denied" : "error";
}

function diffText(value: { chunks: readonly { diffString: string }[] } | undefined): string {
  return value?.chunks.map((chunk) => chunk.diffString).filter((chunk) => chunk.length > 0).join("") ?? "";
}

function callBase(call: ClientSideToolV2Call, kind: ToolResultCardSnapshot["kind"], path: string | null, command: string | null, workingDirectory: string | null, isBackground: boolean): ToolResultCardSnapshot {
  return {
    kind,
    toolCallId: call.toolCallId,
    status: "running",
    path,
    command,
    workingDirectory,
    summary: "",
    output: "",
    diff: "",
    isStreaming: true,
    isBackground
  };
}

function projectCall(call: ClientSideToolV2Call): ToolResultCardSnapshot | null {
  if (nonEmpty(call.toolCallId) == null || !isSupportedTool(call.tool)) return null;

  if (call.tool === CLIENT_SIDE_TOOL_EDIT_FILE) {
    if (call.params.case !== "editFileParams") return null;
    const params: EditFileParams = call.params.value;
    const path = nonEmpty(params.relativeWorkspacePath);
    return path == null ? null : callBase(call, "file-edit", path, null, null, false);
  }

  if (call.tool === CLIENT_SIDE_TOOL_EDIT_FILE_V2) {
    if (call.params.case !== "editFileV2Params") return null;
    const params: EditFileV2Params = call.params.value;
    const path = nonEmpty(params.relativeWorkspacePath);
    if (path == null) return null;
    return callBase(call, "file-edit", path, null, null, false);
  }

  if (call.params.case !== "runTerminalCommandV2Params") return null;
  const params: RunTerminalCommandV2Params = call.params.value;
  const command = nonEmpty(params.command);
  return command == null
    ? null
    : callBase(call, "shell", null, command, params.cwd ?? null, params.isBackground);
}

function sameSupportedTool(call: ClientSideToolV2Call, result: ClientSideToolV2Result): boolean {
  return isSupportedTool(result.tool) && result.tool === call.tool;
}

function projectError(callSnapshot: ToolResultCardSnapshot, error: ToolResultError): ToolResultCardSnapshot {
  return {
    ...callSnapshot,
    status: errorStatus(error),
    summary: errorMessage(error),
    isStreaming: false
  };
}

function projectEditResult(callSnapshot: ToolResultCardSnapshot, result: EditFileResult): ToolResultCardSnapshot | null {
  if (result.rejected === true) return { ...callSnapshot, status: "rejected", isStreaming: false };
  if (result.applyFailed || result.recoverableError != null) return { ...callSnapshot, status: "error", isStreaming: false };
  if (!result.isApplied) return null;
  return { ...callSnapshot, status: "success", diff: diffText(result.diff), isStreaming: false };
}

function projectEditV2Result(callSnapshot: ToolResultCardSnapshot, result: EditFileV2Result): ToolResultCardSnapshot {
  return {
    ...callSnapshot,
    kind: result.fileWasCreated ? "file-write" : "file-edit",
    status: result.rejected === true ? "rejected" : "success",
    diff: diffText(result.diff),
    isStreaming: false
  };
}

function projectShellResult(callSnapshot: ToolResultCardSnapshot, result: RunTerminalCommandV2Result): ToolResultCardSnapshot | null {
  const output = result.outputRaw.length > 0 ? result.outputRaw : result.output;
  if (result.rejected === true) return { ...callSnapshot, status: "rejected", output, isStreaming: false };
  if (result.poppedOutIntoBackground || result.isRunningInBackground) return { ...callSnapshot, status: "background", output, isStreaming: false, isBackground: true };
  switch (result.endedReason) {
    case 1: return { ...callSnapshot, status: "success", output, isStreaming: false };
    case 2: return { ...callSnapshot, status: "cancelled", output, isStreaming: false };
    case 3:
    case 4:
    case 5: return { ...callSnapshot, status: "error", output, isStreaming: false };
    default: return null;
  }
}

function projectResult(call: ClientSideToolV2Call, callSnapshot: ToolResultCardSnapshot, result: ClientSideToolV2Result): ToolResultCardSnapshot | null {
  if (nonEmpty(result.toolCallId) == null || result.toolCallId !== call.toolCallId || !sameSupportedTool(call, result)) return null;
  if (result.error != null) return projectError(callSnapshot, result.error);

  if (call.tool === CLIENT_SIDE_TOOL_EDIT_FILE) {
    return result.result.case === "editFileResult" ? projectEditResult(callSnapshot, result.result.value) : null;
  }
  if (call.tool === CLIENT_SIDE_TOOL_EDIT_FILE_V2) {
    return result.result.case === "editFileV2Result" ? projectEditV2Result(callSnapshot, result.result.value) : null;
  }
  return result.result.case === "runTerminalCommandV2Result" ? projectShellResult(callSnapshot, result.result.value) : null;
}

export function createClientSideToolResultMergeState(): ClientSideToolResultMergeState {
  return EMPTY_STATE;
}

export function mergeClientSideToolResultUpdate(state: ClientSideToolResultMergeState, update: ClientSideToolUpdate): ClientSideToolResultMergeState {
  if (!Number.isSafeInteger(update.sequence) || update.sequence <= state.lastSequence) return state;

  if (update.kind === "call") {
    const callSnapshot = projectCall(update.value);
    if (callSnapshot == null) return { ...state, lastSequence: update.sequence };
    if (state.call != null && state.call.toolCallId !== update.value.toolCallId) return { ...state, lastSequence: update.sequence };
    return { call: update.value, snapshot: callSnapshot, lastSequence: update.sequence };
  }

  if (state.call == null || state.snapshot == null) return { ...state, lastSequence: update.sequence };
  const snapshot = projectResult(state.call, state.snapshot, update.value);
  return snapshot == null ? { ...state, lastSequence: update.sequence } : { ...state, snapshot, lastSequence: update.sequence };
}
