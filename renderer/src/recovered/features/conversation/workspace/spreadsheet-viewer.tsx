import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AttachmentBytesResult } from "../../../contracts/desktop-bridge";
import {
  createSpreadsheetPreviewController,
  parseSpreadsheetBytes,
  SPREADSHEET_RENDER_ROWS,
  type SpreadsheetBytesReader,
  type SpreadsheetPreviewSnapshot,
  type SpreadsheetRuntime,
  type SpreadsheetSheet,
} from "./spreadsheet-viewer-model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4566629 (shared file-byte resource)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4696461 (spreadsheet parser and lazy vendor boundary)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4697585 (file-table viewer lifecycle)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4708351 (file-chip/table preview entry)
// @evidence src/app/dist/renderer/assets/xlsx-CNerDvZX.js#SHA256=88bd58aabec374fbb50e18e1f271a15d6fca247297e8af73db4c368ae0408a9c

export const XLSX_RUNTIME_ASSET = "xlsx-CNerDvZX.js";

export interface SpreadsheetRuntimeModule {
  readonly read: SpreadsheetRuntime["read"];
  readonly utils: SpreadsheetRuntime["utils"];
}

export async function loadShippedSpreadsheetRuntime(): Promise<SpreadsheetRuntime> {
  const base = import.meta.env?.DEV === true && typeof window !== "undefined"
    ? new URL("/upstream/assets/", window.location.href)
    : new URL("./", import.meta.url);
  const module = await import(/* @vite-ignore */ new URL(XLSX_RUNTIME_ASSET, base).href) as SpreadsheetRuntimeModule;
  if (typeof module.read !== "function" || typeof module.utils?.sheet_to_json !== "function") throw new Error("The shipped spreadsheet parser is unavailable.");
  return module;
}

export interface SpreadsheetViewerProps {
  readonly source: string;
  readonly name: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onDownload: () => void | Promise<boolean>;
  readonly readAttachmentBytes: SpreadsheetBytesReader["readAttachmentBytes"];
  readonly loadRuntime?: () => Promise<SpreadsheetRuntime>;
}

const emptySnapshot = (): SpreadsheetPreviewSnapshot => ({ status: "idle" });

function useSpreadsheetSnapshot(
  source: string,
  readAttachmentBytes: SpreadsheetBytesReader["readAttachmentBytes"],
  loadRuntime: () => Promise<SpreadsheetRuntime>,
  isOpen: boolean,
): SpreadsheetPreviewSnapshot {
  const reader = useMemo<SpreadsheetBytesReader>(() => ({ readAttachmentBytes }), [readAttachmentBytes]);
  const controller = useMemo(() => createSpreadsheetPreviewController({
    source,
    reader,
    parse: async (bytes, path) => parseSpreadsheetBytes(bytes, path, await loadRuntime()),
  }), [loadRuntime, reader, source]);
  useEffect(() => {
    if (!isOpen) return undefined;
    void controller.load();
    return () => controller.reset();
  }, [controller, isOpen]);
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, emptySnapshot);
}

function FileViewerState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="sand-file-viewer__state" role="alert">
    <strong>{title}</strong>
    {detail == null ? null : <span>{detail}</span>}
    {action == null ? null : <div className="sand-1k70j0n">{action}</div>}
  </div>;
}

function cellAt(sheet: SpreadsheetSheet, row: number, column: number): string {
  if (row === -1) return sheet.rows[0]?.[column] ?? "";
  return sheet.rows[row + 1]?.[column] ?? "";
}

function SpreadsheetTable({ sheet }: { sheet: SpreadsheetSheet }) {
  const [selected, setSelected] = useState<{ row: number; column: number } | null>(null);
  const header = sheet.rows[0] ?? [];
  const rowValues = sheet.rows.slice(1, SPREADSHEET_RENDER_ROWS + 1);
  const columnCount = Math.min(SPREADSHEET_RENDER_ROWS, sheet.rows.reduce((count, row) => Math.max(count, row.length), 0));
  if (rowValues.length === 0) return <FileViewerState title="This sheet is empty" />;

  const selectCell = (row: number, column: number) => {
    if (cellAt(sheet, row, column).length === 0) {
      setSelected(null);
      return;
    }
    setSelected((current) => current?.row === row && current.column === column ? null : { row, column });
  };
  const selectedText = selected == null ? null : cellAt(sheet, selected.row, selected.column);
  const selectedLabel = selected == null ? "" : `${header[selected.column] || `Column ${selected.column + 1}`} · ${selected.row === -1 ? "header" : `row ${selected.row + 1}`}`;
  return <>
    <div className="sand-1iyjqo2 sand-2lwn1j">
      <div className="sand-c7ga6q sand-13qp9f6">
        <table className="sand-1mwwwfo sand-1ct8sxb sand-ss6m8b sand-19aaqeu sand-1hx0egp">
          <thead><tr>
            <th aria-hidden="true" />
            {Array.from({ length: columnCount }, (_, column) => <th data-cell="" data-col={column} data-row={-1} key={`header-${column}`} onClick={() => selectCell(-1, column)} title={header[column]?.length > 0 ? header[column] : undefined}>{header[column] ?? ""}</th>)}
          </tr></thead>
          <tbody>{rowValues.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>
            <td>{rowIndex + 1}</td>
            {Array.from({ length: columnCount }, (_, column) => {
              const value = row[column] ?? "";
              return <td data-cell="" data-col={column} data-row={rowIndex} key={`cell-${rowIndex}-${column}`} onClick={() => selectCell(rowIndex, column)} title={value.length > 0 ? value : undefined}>{value}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    {selectedText == null ? null : <div className="sand-10l6tqk sand-pnmzw7 sand-lftelb sand-n0vg7t sand-zkaem6 sand-78zum5 sand-dt5ytf sand-12yisup sand-1q4ynmn sand-mkeg23 sand-1y0btm7 sand-cq4si4 sand-lb921d sand-b3r6kr">
      <div className="sand-78zum5 sand-6s0dn4 sand-1qughib sand-167g77z sand-2lah0s sand-1yrsyyn sand-10b6aqq sand-f18ygs sand-y13l1i sand-so031l sand-1q0q8m5 sand-17fyfba">
        <span>{selectedLabel}</span>
        <button aria-label="Close cell detail" onClick={() => setSelected(null)} type="button">×</button>
      </div>
      <div className="sand-1iyjqo2 sand-2lwn1j"><div className="sand-1ghz6dp sand-889kno sand-sag5q8 sand-zjhap9 sand-19tmk5i sand-126k92a sand-j0a0fe sand-1ct8sxb sand-1evy7pa sand-ss6m8b sand-1wd3ewq">{selectedText}</div></div>
    </div>}
  </>;
}

function SpreadsheetBody({ snapshot, onDownload, source, downloadName, selectedSheet, setSelectedSheet }: {
  readonly snapshot: SpreadsheetPreviewSnapshot;
  readonly onDownload: () => void | Promise<boolean>;
  readonly source: string;
  readonly downloadName: string;
  readonly selectedSheet: number;
  readonly setSelectedSheet: (index: number) => void;
}) {
  if (snapshot.status === "loading" || snapshot.status === "idle") return <div aria-live="polite" className="sand-file-viewer__body" role="status">Loading spreadsheet…</div>;
  if (snapshot.status === "too-large") return <div className="sand-file-viewer__body"><FileViewerState action={<a download={downloadName} href={source} onClick={() => { void onDownload(); }}>Download</a>} detail="This spreadsheet is too large to preview here. Download it to open it in full." title="Spreadsheet too large to preview" /></div>;
  if (snapshot.status === "missing") return <div className="sand-file-viewer__body"><FileViewerState title="File unavailable" /></div>;
  if (snapshot.status === "error") return <div className="sand-file-viewer__body"><FileViewerState title="Couldn't read this spreadsheet" /></div>;
  const sheet = snapshot.sheets[selectedSheet] ?? null;
  return <div className="sand-file-viewer__body">
    {sheet == null ? <FileViewerState title="File unavailable" /> : <SpreadsheetTable sheet={sheet} />}
  </div>;
}

export function SpreadsheetViewer({ source, name, isOpen, onClose, onDownload, readAttachmentBytes, loadRuntime = loadShippedSpreadsheetRuntime }: SpreadsheetViewerProps) {
  const titleId = useId();
  const snapshot = useSpreadsheetSnapshot(source, readAttachmentBytes, loadRuntime, isOpen);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const sheets = snapshot.status === "ready" ? snapshot.sheets : [];
  useEffect(() => setSelectedSheet(0), [sheets]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const rowCount = sheets[selectedSheet] == null ? null : Math.max(0, sheets[selectedSheet].totalRows - 1);
  return createPortal(<div aria-labelledby={titleId} aria-modal="true" className="sand-file-viewer" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
    <section className="sand-file-viewer__panel">
      <header className="sand-file-viewer__header">
        <div><h2 id={titleId}>{name}</h2>{rowCount == null ? null : <span>{rowCount.toLocaleString()} {rowCount === 1 ? "row" : "rows"}</span>}</div>
        {sheets.length > 1 ? <div className="sand-file-viewer__toolbar">{sheets.map((sheet, index) => <button aria-pressed={index === selectedSheet} key={`${sheet.name}-${index}`} onClick={() => setSelectedSheet(index)} type="button">{sheet.name}</button>)}</div> : null}
        <div className="sand-file-viewer__actions"><a aria-label="Download file" download={name} href={source} onClick={() => { void onDownload(); }}>⇩</a><button aria-label="Close preview" onClick={onClose} type="button">×</button></div>
      </header>
      <SpreadsheetBody downloadName={name} onDownload={onDownload} selectedSheet={selectedSheet} setSelectedSheet={setSelectedSheet} snapshot={snapshot} source={source} />
    </section>
  </div>, document.body);
}

export default SpreadsheetViewer;
