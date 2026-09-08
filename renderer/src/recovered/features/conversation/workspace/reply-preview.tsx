import type { ReactNode } from "react";
import type { ComposerDraft, TranscriptReplyPreview } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4720289
const REPLY_TEXT_LABEL_LIMIT = 40;
const REPLY_QUOTE_LIMIT = 96;

function replyAttachmentBasename(url: string): string {
  let path = url;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    // The reply target may be a local path rather than a URL.
  }
  const trimmed = path.replace(/\/+$/u, "");
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return (slash >= 0 ? trimmed.slice(slash + 1) : trimmed) || url;
}

function replyLinkHost(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function normalizeReplyText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function truncateReplyText(text: string, limit: number): string {
  const normalized = normalizeReplyText(text);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

/** The compact target label used by the shipped reply quote and composer pill. */
export function replyPreviewLabel(preview: TranscriptReplyPreview): string {
  switch (preview.kind) {
    case "user-text":
    case "assistant-text": {
      const text = normalizeReplyText(preview.text);
      if (text.length === 0) return "Thread";
      if (text.length <= REPLY_TEXT_LABEL_LIMIT) return text;
      return `${text.slice(0, REPLY_TEXT_LABEL_LIMIT - 1).replace(/[\s:;,.!?\u2013\u2014-]+$/gu, "")}…`;
    }
    case "image":
      return "Photo";
    case "file":
      return preview.name != null && preview.name.length > 0 ? preview.name : replyAttachmentBasename(preview.url);
    case "link":
      return replyLinkHost(preview.url);
    case "missing":
      return "Thread";
  }
}

export function replyQuoteLabel(preview: TranscriptReplyPreview): string {
  switch (preview.kind) {
    case "user-text":
    case "assistant-text": {
      const text = truncateReplyText(preview.text, REPLY_QUOTE_LIMIT);
      return text.length > 0 ? text : "(empty)";
    }
    case "image":
      return "Photo";
    case "file":
      return truncateReplyText(replyPreviewLabel(preview), REPLY_QUOTE_LIMIT);
    case "link":
      return truncateReplyText(replyPreviewLabel(preview), REPLY_QUOTE_LIMIT);
    case "missing":
      return "(deleted)";
  }
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4761587
export function replyComposerPlaceholder(preview: TranscriptReplyPreview): string {
  switch (preview.kind) {
    case "user-text":
    case "assistant-text":
    case "missing":
      return "Reply…";
    case "image":
      return "Reply to attachment…";
    case "file":
      return "Reply to file…";
    case "link":
      return "Reply to link…";
  }
}

function replyPreviewIcon(preview: TranscriptReplyPreview): ReactNode {
  if (preview.kind === "file") return <span aria-hidden="true" data-icon-name="file" />;
  if (preview.kind === "link") return <span aria-hidden="true" data-icon-name="link" />;
  return null;
}

export interface ReplyQuoteProps {
  targetId: string;
  preview: TranscriptReplyPreview;
  isInScope: boolean;
  onOpen(targetId: string, isInScope: boolean): void;
  ariaDescribedBy?: string;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5097299
export function ReplyQuote({ targetId, preview, isInScope, onOpen, ariaDescribedBy }: ReplyQuoteProps) {
  const label = isInScope ? "Jump to replied message" : "Open reply thread";
  return (
    <button
      aria-label={label}
      aria-describedby={ariaDescribedBy}
      className="sand-reply-quote sand-3nfvp2 sand-6s0dn4 sand-1jnr06f sand-1iorvi4 sand-y13l1i sand-18d9i69 sand-163pfp sand-dj266r sand-1yf7rl7 sand-12nagc sand-j3b58b sand-1q8iv8g sand-1jy3azn sand-javwx2 sand-c342km sand-ng3xce sand-jbqb8w sand-4b2ntj sand-xs50az sand-pei9bn sand-1t35e8 sand-1pd3egz sand-jbqb8w sand-11wthnw sand-1ja60sm sand-16tdsg8 sand-1ypdohk sand-1t137rt sand-b3r6kr sand-1fdfdz7"
      data-reply-target-id={targetId}
      data-variant="quote"
      onClick={() => onOpen(targetId, isInScope)}
      type="button"
    >
      <span aria-hidden="true" className="sand-reply-quote__lead" data-icon-name="arrow-u-up-right" />
      {replyPreviewIcon(preview)}
      <span className="sand-reply-quote__label">{replyQuoteLabel(preview)}</span>
    </button>
  );
}

export interface ComposerReplyTarget {
  targetId: string;
  preview: TranscriptReplyPreview;
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4725937
export function ComposerReplyPill({ target, onClear }: { target: ComposerReplyTarget; onClear(): void }) {
  const labelId = `sand-composer-reply-${encodeURIComponent(target.targetId)}`;
  return (
    <div aria-labelledby={labelId} className="sand-prompt-reply-pill sand-1g77sc7 sand-78zum5 sand-6s0dn4 sand-17d4w8g sand-h8yej3 sand-euugli sand-1iorvi4 sand-mzs88n sand-jkvuk6 sand-163pfp sand-1q4ynmn sand-i07v4r sand-19aaqeu sand-fc7y3v sand-1yxxptd" role="region">
      <span aria-hidden="true" className="sand-prompt-reply-pill__lead sand-2lah0s sand-4b2ntj" data-icon-name="arrow-u-up-right" />
      <span className="sand-prompt-reply-pill__body sand-3nfvp2 sand-6s0dn4 sand-17d4w8g sand-euugli sand-1iyjqo2 sand-b3r6kr" id={labelId}>
        <span className="sand-reply-quote__label">{replyQuoteLabel(target.preview)}</span>
      </span>
      <button aria-label="Cancel reply" className="sand-prompt-reply-pill__clear sand-2lah0s sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-w4jnvo sand-1qx5ct2 sand-exx8yu sand-1xpa7k sand-18d9i69 sand-1uhho1l sand-c342km sand-ng3xce sand-149ho13 sand-jbqb8w sand-1kj6vsg sand-4b2ntj sand-7gh5u8 sand-1ypdohk sand-1ge13bo" onClick={onClear} type="button">
        <span aria-hidden="true" data-icon-name="close" />
      </button>
    </div>
  );
}
