import type { AttachmentBytesResult } from "../../../contracts/desktop-bridge";
import { attachmentBasename, inferAttachmentKind, type DraftAttachment } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4705034 (file-kind table dispatch)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4566629 (attachment byte resource)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4708351 (file-card preview entry)

/** The existing file-card projection reaches the spreadsheet viewer only for this kind. */
export interface SpreadsheetViewerEntryProjection {
  readonly kind: "table";
  readonly source: string;
  readonly name: string;
  readonly downloadName: string;
  readonly size?: number;
}

export interface SpreadsheetViewerActions {
  readonly readAttachmentBytes: (source: string, maxBytes: number) => Promise<AttachmentBytesResult | null>;
  readonly downloadAttachment: (source: string, suggestedName?: string) => Promise<boolean>;
}

/**
 * The smallest root-independent contract consumed by SpreadsheetViewer. The provider
 * owns entry identity and makes callbacks from a closed/replaced entry inert.
 */
export interface SpreadsheetViewerMount {
  readonly entry: SpreadsheetViewerEntryProjection;
  readonly readAttachmentBytes: (source: string, maxBytes: number) => Promise<AttachmentBytesResult | null>;
  readonly onDownload: () => Promise<boolean>;
  readonly close: () => void;
  readonly isOpen: () => boolean;
}

export interface SpreadsheetViewerProvider {
  project(attachment: DraftAttachment): SpreadsheetViewerEntryProjection | null;
  mount(attachment: DraftAttachment): SpreadsheetViewerMount | null;
  close(): void;
  reset(): void;
  dispose(): void;
}

export function projectSpreadsheetViewerEntry(attachment: DraftAttachment): SpreadsheetViewerEntryProjection | null {
  const kind = inferAttachmentKind({ mimeType: attachment.mimeType, fileName: attachment.name, urlOrPath: attachment.path });
  if (kind !== "table") return null;
  const name = attachment.name || attachmentBasename(attachment.path);
  return {
    kind,
    source: attachment.path,
    name,
    downloadName: name,
    ...(attachment.size === undefined ? {} : { size: attachment.size }),
  };
}

export function createSpreadsheetViewerProvider(actions: SpreadsheetViewerActions): SpreadsheetViewerProvider {
  let generation = 0;
  let active: { readonly generation: number; readonly entry: SpreadsheetViewerEntryProjection } | null = null;
  let disposed = false;

  const isCurrent = (entryGeneration: number): boolean => !disposed && active?.generation === entryGeneration;
  const invalidate = (): void => {
    generation += 1;
    active = null;
  };

  return {
    project: projectSpreadsheetViewerEntry,
    mount(attachment) {
      if (disposed) return null;
      const entry = projectSpreadsheetViewerEntry(attachment);
      if (entry == null) return null;
      const entryGeneration = ++generation;
      active = { generation: entryGeneration, entry };
      const close = (): void => {
        if (!isCurrent(entryGeneration)) return;
        invalidate();
      };
      const readAttachmentBytes = async (source: string, maxBytes: number): Promise<AttachmentBytesResult | null> => {
        if (!isCurrent(entryGeneration) || source !== entry.source) return null;
        try {
          const result = await actions.readAttachmentBytes(source, maxBytes);
          return isCurrent(entryGeneration) ? result : null;
        } catch (error: unknown) {
          if (!isCurrent(entryGeneration)) return null;
          throw error;
        }
      };
      const onDownload = async (): Promise<boolean> => {
        if (!isCurrent(entryGeneration)) return false;
        try {
          const result = await actions.downloadAttachment(entry.source, entry.downloadName);
          return isCurrent(entryGeneration) ? result : false;
        } catch (error: unknown) {
          if (!isCurrent(entryGeneration)) return false;
          throw error;
        }
      };
      return { entry, readAttachmentBytes, onDownload, close, isOpen: () => isCurrent(entryGeneration) };
    },
    close: invalidate,
    reset: invalidate,
    dispose() {
      if (disposed) return;
      invalidate();
      disposed = true;
    },
  };
}
