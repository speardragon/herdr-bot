import type { AttachmentBytesResult } from "../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4696461 (CSV/XLSX parser boundary)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4697585 (spreadsheet viewer model)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4699722 (sheet table projection)

export const SPREADSHEET_MAX_ROWS = 2_000;
export const SPREADSHEET_RENDER_ROWS = 200;
export const SPREADSHEET_PREVIEW_BYTE_CAP = 25 * 1024 * 1024;

export interface SpreadsheetSheet {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
  readonly totalRows: number;
}

export interface SpreadsheetRuntime {
  read(bytes: Uint8Array, options: { type: "array" }): SpreadsheetWorkbook;
  readonly utils: SpreadsheetUtils;
}

export interface SpreadsheetUtils {
  sheet_to_json(sheet: SpreadsheetWorksheet, options: {
    header: 1;
    blankrows: false;
    defval: "";
    raw: false;
  }): readonly unknown[];
}

export interface SpreadsheetWorkbook {
  readonly SheetNames: readonly string[];
  readonly Sheets: Readonly<Record<string, SpreadsheetWorksheet | undefined>>;
}

export interface SpreadsheetWorksheet {
  readonly [key: string]: unknown;
}

export interface SpreadsheetBytesReader {
  readAttachmentBytes(source: string, maxBytes: number): Promise<AttachmentBytesResult | null>;
}

export type SpreadsheetPreviewSnapshot =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly sheets: readonly SpreadsheetSheet[] }
  | { readonly status: "missing" }
  | { readonly status: "too-large"; readonly size: number }
  | { readonly status: "error"; readonly error: unknown };

export type SpreadsheetParse = (bytes: Uint8Array, source: string) => Promise<readonly SpreadsheetSheet[]>;

function fileExtension(source: string): string | null {
  const name = source.split(/[\\/]/).filter((part) => part.length > 0).at(-1) ?? source;
  const dot = name.lastIndexOf(".");
  return dot <= 0 || dot === name.length - 1 ? null : name.slice(dot + 1).toLowerCase();
}

function isDelimited(source: string): boolean {
  const extension = fileExtension(source);
  return extension === "csv" || extension === "tsv";
}

function delimiterFor(source: string): "," | "\t" {
  return fileExtension(source) === "tsv" ? "\t" : ",";
}

function parseDelimitedRows(text: string, delimiter: "," | "\t", maxRows: number): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let hasContent = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    hasContent = false;
  };
  for (let index = 0; index < text.length && rows.length < maxRows; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
      hasContent = true;
      continue;
    }
    if (character === delimiter) {
      hasContent = true;
      pushField();
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
      continue;
    }
    field += character;
    hasContent = true;
  }
  if (rows.length < maxRows && (hasContent || field.length > 0 || row.length > 0)) pushRow();
  return rows;
}

function countDelimitedRows(text: string): number {
  let rows = 0;
  let quoted = false;
  let hasContent = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
      hasContent = true;
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      rows += 1;
      hasContent = false;
      continue;
    }
    if (!/\s/.test(character)) hasContent = true;
  }
  return hasContent ? rows + 1 : rows;
}

function textCell(value: unknown): string {
  return value == null ? "" : String(value);
}

/** Mirrors the shipped CSV/TSV fast path, including its total-row estimate after truncation. */
export function parseDelimitedSpreadsheet(text: string, source: string, maxRows = SPREADSHEET_MAX_ROWS): SpreadsheetSheet[] {
  const rows = parseDelimitedRows(text, delimiterFor(source), maxRows);
  const totalRows = rows.length < maxRows ? rows.length : countDelimitedRows(text);
  return [{ name: "Sheet 1", rows, totalRows }];
}

/** Projects the vendor parser's array-of-arrays result without copying the vendor implementation. */
export function projectWorkbook(workbook: SpreadsheetWorkbook, maxRows = SPREADSHEET_MAX_ROWS, utils: SpreadsheetUtils): SpreadsheetSheet[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (sheet == null) return { name, rows: [], totalRows: 0 };
    const values = utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "", raw: false });
    const rows = values.slice(0, maxRows).map((row) => Array.isArray(row) ? row.map(textCell) : []);
    return { name, rows, totalRows: values.length };
  });
}

export async function parseSpreadsheetBytes(
  bytes: Uint8Array,
  source: string,
  runtime: SpreadsheetRuntime,
  maxRows = SPREADSHEET_MAX_ROWS,
): Promise<SpreadsheetSheet[]> {
  if (isDelimited(source)) return parseDelimitedSpreadsheet(new TextDecoder("utf-8", { fatal: false }).decode(bytes), source, maxRows);
  return projectWorkbook(runtime.read(bytes, { type: "array" }), maxRows, runtime.utils);
}

export interface SpreadsheetPreviewController {
  getSnapshot(): SpreadsheetPreviewSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<SpreadsheetPreviewSnapshot>;
  reset(): void;
  dispose(): void;
}

export function createSpreadsheetPreviewController(options: {
  readonly source: string;
  readonly reader: SpreadsheetBytesReader;
  readonly parse: SpreadsheetParse;
  readonly maxBytes?: number;
}): SpreadsheetPreviewController {
  let snapshot: SpreadsheetPreviewSnapshot = { status: "idle" };
  const listeners = new Set<() => void>();
  let generation = 0;
  let request: Promise<SpreadsheetPreviewSnapshot> | null = null;
  let disposed = false;

  const publish = (next: SpreadsheetPreviewSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      if (disposed) return snapshot;
      if (request != null) return request;
      const requestGeneration = generation;
      publish({ status: "loading" });
      const operation = options.reader.readAttachmentBytes(options.source, options.maxBytes ?? SPREADSHEET_PREVIEW_BYTE_CAP).then(async (result) => {
        if (disposed || requestGeneration !== generation) return snapshot;
        if (result == null) {
          publish({ status: "missing" });
          return snapshot;
        }
        if (result.kind === "too-large") {
          publish({ status: "too-large", size: result.size });
          return snapshot;
        }
        try {
          const sheets = await options.parse(result.bytes, options.source);
          if (disposed || requestGeneration !== generation) return snapshot;
          publish({ status: "ready", sheets });
        } catch (error: unknown) {
          if (disposed || requestGeneration !== generation) return snapshot;
          publish({ status: "error", error });
        }
        return snapshot;
      }, (error: unknown) => {
        if (disposed || requestGeneration !== generation) return snapshot;
        publish({ status: "error", error });
        return snapshot;
      }).finally(() => {
        if (request === operation) request = null;
      });
      request = operation;
      return operation;
    },
    reset() {
      if (disposed) return;
      generation += 1;
      request = null;
      publish({ status: "idle" });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      request = null;
      listeners.clear();
    },
  };
}
