import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { RendererAgentLastEntry } from "../../../../production/model";
import {
  AgentPreviewHeader,
  type AgentPreviewAvatarProjection,
  type AgentPreviewAgent,
  type AgentPreviewStatusProjection
} from "./sidebar-agent-preview-header";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2408096 (waiting/draft/last-entry preview precedence; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2409795 (sand-agent-hover-card__preview; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3066806 (waiting/draft/last-entry preview precedence; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3069049 (sand-agent-hover-card__preview; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

const markdownPreviewReplacements: readonly [RegExp, string][] = [
  [/`+/g, ""],
  [/!\[([^\]]*)\]\([^)]*\)/g, "$1"],
  [/\[([^\]]+)\]\([^)]*\)/g, "$1"],
  [/\$\$((?:[^$\\]|\\[\s\S])+?)\$\$/g, "$1"],
  [/\\\(([\s\S]+?)\\\)/g, "$1"],
  [/\\\[([\s\S]+?)\\\]/g, "$1"],
  [/\\\$/g, "$"],
  [/^\s{0,3}#{1,6}\s+/gm, ""],
  [/^\s{0,3}>\s?/gm, ""],
  [/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, ""],
  [/\*\*([^*]+)\*\*/g, "$1"],
  [/__([^_]+)__/g, "$1"],
  [/~~([^~]+)~~/g, "$1"],
  [/\*([^*\n]+)\*/g, "$1"],
  [new RegExp("(?<!\\w)_([^_\\n]+)_(?!\\w)", "g"), "$1"],
  [/\|/g, " " ]
];

const attachmentLabels: Readonly<Record<string, { singular: string; plural: string }>> = {
  image: { singular: "image", plural: "images" },
  video: { singular: "video", plural: "videos" },
  audio: { singular: "audio file", plural: "audio files" },
  pdf: { singular: "PDF", plural: "PDFs" },
  markdown: { singular: "Markdown file", plural: "Markdown files" },
  table: { singular: "spreadsheet", plural: "spreadsheets" },
  json: { singular: "JSON file", plural: "JSON files" },
  text: { singular: "text file", plural: "text files" },
  document: { singular: "document", plural: "documents" },
  archive: { singular: "archive", plural: "archives" },
  file: { singular: "file", plural: "files" }
};

function attachmentLabel(kind: string, count: number): string {
  const label = attachmentLabels[kind] ?? attachmentLabels.file;
  return `${count} ${count === 1 ? label.singular : label.plural}`;
}

function previewAttachment(entry: Extract<RendererAgentLastEntry, { kind: "attachment" }>): string {
  const count = Math.max(1, Math.floor(entry.count));
  const kinds = Object.entries(entry.kinds)
    .filter(([, value]) => value > 0)
    .map(([kind, value]) => ({ kind: attachmentLabels[kind] == null ? "file" : kind, count: value }));
  if (kinds.length === 0) return `Sent ${attachmentLabel("file", count)}`;
  if (kinds.length === 1) return `Sent ${attachmentLabel(kinds[0].kind, count)}`;
  return `Sent ${attachmentLabel("file", count)} · ${kinds.map(({ kind, count: kindCount }) => attachmentLabel(kind, kindCount)).join(", ")}`;
}

export function previewTextFromLastEntry(entry: RendererAgentLastEntry | null): string {
  if (entry == null) return "";
  if (entry.kind === "link") return `Sent a link · ${entry.url}`;
  if (entry.kind === "attachment") return previewAttachment(entry);
  return markdownPreviewReplacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), entry.text).replace(/\s+/g, " ").trim();
}

export interface AgentPreviewContentProps {
  readonly agent: AgentPreviewAgent;
  readonly isHostReachable: boolean;
  readonly draftPreview: string;
  readonly isPinned?: boolean;
  readonly renderAvatar?: (projection: AgentPreviewAvatarProjection) => ReactNode;
  readonly renderStatus?: (projection: AgentPreviewStatusProjection) => ReactNode;
  readonly renderPinnedIcon?: () => ReactNode;
  readonly announceStatus?: boolean;
  readonly now?: number;
}

function waitingReason(agent: { readonly awaitingUserResponse?: unknown | null; readonly waitingReason?: string }): string | null {
  if (agent.waitingReason != null) return agent.waitingReason;
  const value = agent.awaitingUserResponse;
  if (typeof value === "object" && value != null && "reason" in value && typeof value.reason === "string") return value.reason;
  return null;
}

/** Unmounted content projection; unavailable private avatar/status primitives remain absent. */
function previewTime(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** The shipped hover-card content leaf, kept separate from its popover owner. */
export function AgentPreviewContent({ agent, isHostReachable, draftPreview, isPinned, renderAvatar, renderStatus, renderPinnedIcon, announceStatus = false, now = Date.now() }: AgentPreviewContentProps) {
  const reason = waitingReason(agent);
  const preview = reason != null
    ? `Waiting for you: ${reason}`
    : draftPreview.length > 0
      ? null
      : previewTextFromLastEntry(agent.lastEntry ?? null) || "No messages yet";
  return <div className="sand-agent-hover-card">
    <AgentPreviewHeader agent={agent} isHostReachable={isHostReachable} isPinned={isPinned} renderAvatar={renderAvatar} renderStatus={renderStatus} renderPinnedIcon={renderPinnedIcon} announceStatus={announceStatus} />
    {agent.updatedAt == null ? null : <time className="sand-agent-hover-card__time" dateTime={new Date(agent.updatedAt).toISOString()}>{previewTime(agent.updatedAt, now)}</time>}
    <span className="sand-agent-hover-card__preview">
      {reason != null ? preview : draftPreview.length > 0 ? <><span className="sand-agent-hover-card__draft-label">Draft:</span> {draftPreview}</> : preview}
    </span>
  </div>;
}

export interface AgentPreviewCompositorProps extends Omit<AgentPreviewContentProps, "now"> {
  readonly children: ReactNode;
  readonly isEnabled?: boolean;
}

/**
 * Exact sdn compositor boundary recovered from the shipped sidebar row. The
 * private Popover primitive is not part of this reconstruction, so the
 * boundary owns only the documented hover/focus, outside/Escape, and cleanup
 * lifecycle while reusing the typed content leaf above.
 */
export function AgentPreviewCompositor({ children, isEnabled = true, ...contentProps }: AgentPreviewCompositorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // herdr-bot: the card lives inline in every anchor's DOM position but its 260px box would sit
  // outside the row it hovers from -- see render below, where it now portals to document.body
  // instead. `rootRef` alone can no longer decide "still inside the hover target" once the card is
  // a document.body sibling, so every containment check below also asks `contentRef`.
  const containsNode = (node: Node | null): boolean =>
    node != null && (rootRef.current?.contains(node) === true || contentRef.current?.contains(node) === true);

  useEffect(() => {
    if (!isOpen || !isEnabled) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && containsNode(event.target)) return;
      setIsOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    // Formerly this card was `position: absolute; left: calc(100% + 8px)` inside the sidebar row,
    // which extended the row's own box 260px past the sidebar's right edge -- since
    // `.sand-agents-list` is `overflow: auto` on both axes, that alone opened a horizontal
    // scrollbar on every hover. Portaling removes it from that scroll content, but an ancestor
    // scroll would then leave the fixed-positioned card stranded over the wrong row, so any
    // scroll while it's open just closes it (a stale card is worse than a closed one).
    const closeOnScroll = () => setIsOpen(false);
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeEscape, true);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeEscape, true);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [isEnabled, isOpen]);

  useEffect(() => {
    if (isEnabled) return;
    setIsOpen(false);
  }, [isEnabled]);

  const openFrom = (target: EventTarget | null) => {
    if (!isEnabled) return;
    if (target instanceof HTMLElement) triggerRef.current = target;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect != null) setAnchor({ top: rect.top, left: rect.right + 8 });
    setIsOpen(true);
  };
  const closeIfLeaving = (event: ReactPointerEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && containsNode(next)) return;
    setIsOpen(false);
  };

  return <div
    aria-label={`${contentProps.agent.name} chat preview`}
    data-preview-open={isOpen || undefined}
    onBlurCapture={(event) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || !containsNode(next)) setIsOpen(false);
    }}
    onFocusCapture={(event) => openFrom(event.target)}
    onPointerEnter={(event) => openFrom(event.target)}
    onPointerLeave={closeIfLeaving}
    ref={rootRef}
    style={{ minWidth: 0, position: "relative" }}
  >
    {children}
    {isEnabled && isOpen && anchor != null && typeof document !== "undefined" ? createPortal(
      <div
        aria-label={`${contentProps.agent.name} chat preview`}
        className="sand-agent-hover-card"
        onPointerEnter={() => setIsOpen(true)}
        onPointerLeave={closeIfLeaving}
        ref={contentRef}
        role="tooltip"
        style={{ background: "#20231f", border: "1px solid #3a4036", borderRadius: 10, boxShadow: "0 12px 30px rgb(0 0 0 / 28%)", color: "#dcdfd8", left: anchor.left, padding: 10, position: "fixed", top: anchor.top, width: 260, zIndex: 3100 }}
      >
        <AgentPreviewContent {...contentProps} now={Date.now()} />
      </div>,
      document.body
    ) : null}
  </div>;
}
