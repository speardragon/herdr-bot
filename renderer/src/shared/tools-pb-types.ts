/**
 * Type-only stand-ins for the handful of generated protobuf types that
 * recovered/features/conversation/tool-results/proto-adapter.ts imports.
 * herdr-bot never produces client-side tool payloads; these keep the adapter
 * compiling without the 12k-line generated proto tree.
 */
export type ClientSideToolV2 = number;

export interface ToolResultError {
  readonly clientVisibleErrorMessage: string;
}

export interface DiffChunks {
  readonly chunks: readonly { readonly diffString: string }[];
}

export interface EditFileParams {
  readonly relativeWorkspacePath: string;
}

export interface EditFileV2Params {
  readonly relativeWorkspacePath: string;
}

export interface RunTerminalCommandV2Params {
  readonly command: string;
  readonly cwd?: string;
  readonly isBackground: boolean;
}

export interface EditFileResult {
  readonly rejected?: boolean;
  readonly applyFailed?: boolean;
  readonly recoverableError?: unknown;
  readonly isApplied: boolean;
  readonly diff?: DiffChunks;
}

export interface EditFileV2Result {
  readonly fileWasCreated: boolean;
  readonly rejected?: boolean;
  readonly diff?: DiffChunks;
}

export interface RunTerminalCommandV2Result {
  readonly outputRaw: string;
  readonly output: string;
  readonly rejected?: boolean;
  readonly poppedOutIntoBackground: boolean;
  readonly isRunningInBackground: boolean;
  readonly endedReason: number;
}

export interface ClientSideToolV2Call {
  readonly toolCallId: string;
  readonly tool: ClientSideToolV2;
  readonly params:
    | { readonly case: "editFileParams"; readonly value: EditFileParams }
    | { readonly case: "editFileV2Params"; readonly value: EditFileV2Params }
    | { readonly case: "runTerminalCommandV2Params"; readonly value: RunTerminalCommandV2Params }
    | { readonly case: undefined; readonly value?: undefined };
}

export interface ClientSideToolV2Result {
  readonly toolCallId: string;
  readonly tool: ClientSideToolV2;
  readonly error?: ToolResultError;
  readonly result:
    | { readonly case: "editFileResult"; readonly value: EditFileResult }
    | { readonly case: "editFileV2Result"; readonly value: EditFileV2Result }
    | { readonly case: "runTerminalCommandV2Result"; readonly value: RunTerminalCommandV2Result }
    | { readonly case: undefined; readonly value?: undefined };
}
