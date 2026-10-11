/**
 * Staged attachment chips, shown above the composer's text row, inside the same bordered card: a small
 * rounded card per file -- bold filename, byte size in tertiary text on the line below, a bordered "×"
 * remove button -- in a row that wraps. Deliberately no thumbnail preview for an image attachment --
 * `resolveAttachmentMedia` exists but isn't wired into staging, by design, not an oversight.
 */
import { X } from "lucide-react";
import { useT } from "../../i18n/TranslationProvider.tsx";
import type { StagedAttachmentDraft } from "./draft-codec.ts";
import styles from "./AttachmentChips.module.css";

export interface AttachmentChipsProps {
  readonly attachments: readonly StagedAttachmentDraft[];
  readonly onRemove: (path: string) => void;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentChips({ attachments, onRemove }: AttachmentChipsProps) {
  const { t } = useT();
  if (attachments.length === 0) return null;

  return (
    <div className={styles["hb-attachment-chips"]}>
      {attachments.map((attachment) => (
        <div key={attachment.path} className={styles["hb-attachment-chip"]}>
          <span className={styles["hb-attachment-chip-name"]} title={attachment.filename}>
            {attachment.filename}
          </span>
          <span className={styles["hb-attachment-chip-size"]}>{formatBytes(attachment.size)}</span>
          <button type="button" className={styles["hb-attachment-chip-remove"]} aria-label={t("composer.attachment.remove", { filename: attachment.filename })} onClick={() => onRemove(attachment.path)}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
