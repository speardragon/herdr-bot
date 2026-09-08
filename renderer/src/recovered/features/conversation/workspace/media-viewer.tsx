// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AttachmentBytesResult, AttachmentMedia } from "../../../contracts/desktop-bridge";
import { attachmentBasename, formatAttachmentBytes, inferAttachmentKind, type AttachmentKind, type DraftAttachment } from "./model";
import { PdfAttachmentViewer, type PdfBytesResolver } from "./pdf-viewer";
import type { TranscriptAdjacency } from "./transcript-adjacency";

// @evidence src/app/dist/renderer/assets/view-DPSBrvyV.js#byteOffset=0 (user-attachment media/file leaf)
// @evidence src/app/dist/renderer/assets/view-DPSBrvyV.js#SHA256=5bf28224da62a9042885e9da60e3fce82ed544846f470241ed6bcf4e12e64040
// @evidence recovered/frontend/app/assets/view-DPSBrvyV.js#byteOffset=0 (Windows user-attachment media/file leaf)
// @evidence recovered/frontend/app/assets/view-DPSBrvyV.js#SHA256=d6a624aff9f519769303ff15fcd51700e5f1b3daa5ba83161112db2a389a508b

export interface MediaViewerAttachment {
  path: string;
  name: string;
}

export type MediaResolver = (source: string) => Promise<AttachmentMedia | null>;

export interface UserAttachmentGalleryMetadata {
  readonly sourceKind?: "user-attachment";
  readonly id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly timestampMs?: number;
  readonly batchId?: string;
  readonly replyTo?: string;
  readonly clientNonce?: string;
}

type GalleryAttachment = DraftAttachment & UserAttachmentGalleryMetadata;

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const DRAG_THRESHOLD = 4;

function isPreviewable(kind: AttachmentKind): boolean {
  return kind === "image" || kind === "video";
}

function mediaSource(media: AttachmentMedia | null): string | null {
  if (media?.kind === "image" || media?.kind === "video") return media.kind === "image" ? media.dataUrl : media.src;
  return null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

function MediaThumbnail({ source, resolveMedia }: { source: string; resolveMedia: MediaResolver }) {
  const [media, setMedia] = useState<AttachmentMedia | null>(null);
  const [state, setState] = useState<"loading" | "missing">("loading");
  useEffect(() => {
    let active = true;
    setMedia(null);
    setState("loading");
    void resolveMedia(source).then((next) => {
      if (!active) return;
      if (next?.kind === "image" || next?.kind === "video") {
        setMedia(next);
        return;
      }
      setState("missing");
    }).catch(() => {
      if (active) setState("missing");
    });
    return () => { active = false; };
  }, [resolveMedia, source]);
  if (media?.kind === "video") return <video aria-hidden className="sand-media-viewer__thumb-video" muted preload="metadata" src={media.src} />;
  if (media?.kind === "image") return <img alt="" aria-hidden className="sand-media-viewer__thumb-image" draggable={false} src={media.dataUrl} />;
  return <div aria-hidden className="sand-media-viewer__thumb-fallback" data-state={state} />;
}

function MediaViewer({ attachments, startIndex, resolveMedia, onClose, restoreFocus }: { attachments: readonly MediaViewerAttachment[]; startIndex: number; resolveMedia: MediaResolver; onClose: () => void; restoreFocus: () => void }) {
  const [index, setIndex] = useState(() => clamp(startIndex, 0, Math.max(0, attachments.length - 1)));
  const [media, setMedia] = useState<AttachmentMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [transform, setTransform] = useState<Transform>({ scale: MIN_ZOOM, x: 0, y: 0 });
  const pointerRef = useRef<{ id: number | null; startX: number; startY: number; originX: number; originY: number; moved: boolean }>({ id: null, startX: 0, startY: 0, originX: 0, originY: 0, moved: false });
  const current = attachments[index] ?? attachments[0];
  const total = attachments.length;
  const caption = current?.name || (current == null ? "" : attachmentBasename(current.path));

  useEffect(() => {
    if (current == null) return undefined;
    let active = true;
    setMedia(null);
    setLoading(true);
    setFailed(false);
    setTransform({ scale: MIN_ZOOM, x: 0, y: 0 });
    void resolveMedia(current.path).then((next) => {
      if (!active) return;
      if (next?.kind === "image" || next?.kind === "video") {
        setMedia(next);
        setLoading(false);
        return;
      }
      setLoading(false);
      setFailed(true);
    }).catch(() => {
      if (active) {
        setLoading(false);
        setFailed(true);
      }
    });
    return () => { active = false; };
  }, [current?.path, resolveMedia]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (total <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((value) => (value - 1 + total) % total);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((value) => (value + 1) % total);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocus();
    };
  }, [onClose, restoreFocus, total]);

  const fit = () => setTransform({ scale: MIN_ZOOM, x: 0, y: 0 });
  const zoom = (factor: number) => setTransform((currentTransform) => ({ ...currentTransform, scale: clamp(currentTransform.scale * factor, MIN_ZOOM, MAX_ZOOM) }));

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    zoom(Math.exp(-event.deltaY * multiplier * 0.0015));
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || transform.scale <= MIN_ZOOM) return;
    const currentTransform = transform;
    pointerRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, originX: currentTransform.x, originY: currentTransform.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.startX;
    const y = event.clientY - pointer.startY;
    if (!pointer.moved && Math.hypot(x, y) > DRAG_THRESHOLD) pointer.moved = true;
    if (pointer.moved) setTransform((currentTransform) => ({ ...currentTransform, x: pointer.originX + x, y: pointer.originY + y }));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerRef.current.id = null;
  };

  if (current == null || typeof document === "undefined") return null;
  const source = mediaSource(media);
  const title = total > 1 ? `Media ${index + 1} of ${total}` : "Media preview";
  const content: ReactNode = loading || failed
    ? <div aria-live="polite" className="sand-media-viewer__state" role={failed ? "alert" : "status"}>{failed ? "Couldn't load media" : "Loading media…"}</div>
    : source == null ? null
      : media?.kind === "video"
        ? <video aria-label={caption.length > 0 ? caption : "Media preview"} className="sand-media-viewer__image" controls={false} onError={() => setFailed(true)} preload="metadata" src={source} style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }} />
        : <img alt={caption.length > 0 ? caption : "Media preview"} className="sand-media-viewer__image" draggable={false} onDoubleClick={fit} onError={() => setFailed(true)} src={source} style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }} />;

  return createPortal(
    <div aria-label={title} aria-modal="true" className="sand-media-viewer" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onPointerCancel={onPointerUp} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} role="dialog">
      <div className="sand-media-viewer__top-bar"><button aria-label="Close media preview" className="sand-media-viewer__close" onClick={onClose} type="button">×</button></div>
      <div className="sand-media-viewer__column">
        <div className="sand-media-viewer__media-cell" onDoubleClick={fit} onWheel={onWheel}>
          {total > 1 ? <button aria-label="Previous media" className="sand-media-viewer__nav" onClick={() => setIndex((value) => (value - 1 + total) % total)} style={{ left: "18px" }} type="button">‹</button> : null}
          {total > 1 ? <button aria-label="Next media" className="sand-media-viewer__nav" onClick={() => setIndex((value) => (value + 1) % total)} style={{ right: "18px" }} type="button">›</button> : null}
          {content}
        </div>
        {caption.length > 0 ? <div className="sand-media-viewer__caption">{caption}</div> : null}
        {total > 1 ? <div className="sand-media-viewer__filmstrip"><div className="sand-media-viewer__filmstrip-track">{attachments.map((attachment, attachmentIndex) => <button aria-current={attachmentIndex === index || undefined} aria-label={`View media ${attachmentIndex + 1} of ${total}`} className="sand-media-viewer__thumb" key={`${attachment.path}:${attachmentIndex}`} onClick={(event) => { event.stopPropagation(); setIndex(attachmentIndex); }} type="button"><MediaThumbnail resolveMedia={resolveMedia} source={attachment.path} /></button>)}</div></div> : null}
      </div>
    </div>,
    document.body,
  );
}

function MediaCard({ attachment, kind, media, loading, role, onOpen, onOpenPdf }: { attachment: GalleryAttachment; kind: AttachmentKind; media: AttachmentMedia | null; loading: boolean; role: "user" | "assistant"; onOpen?: (trigger: HTMLButtonElement) => void; onOpenPdf?: (trigger: HTMLButtonElement) => void }) {
  const label = attachment.name || attachmentBasename(attachment.path);
  const attachmentLabel = role === "assistant" ? "Agent attachment" : "User attachment";
  const userMediaStyle = attachment.sourceKind === "user-attachment" ? { maxWidth: 320 } : undefined;
  if (media?.kind === "image" && onOpen != null) return <button aria-label="Media preview" className="sand-attachment" data-attachment-label={attachmentLabel} onClick={(event) => onOpen(event.currentTarget)} type="button"><img alt={label} className="sand-attachment__image" draggable={false} height={attachment.height ?? undefined} src={media.dataUrl} style={userMediaStyle} width={attachment.width ?? undefined} /></button>;
  if (media?.kind === "video" && onOpen != null) return <button aria-label="Media preview" className="sand-attachment" data-attachment-label={attachmentLabel} onClick={(event) => onOpen(event.currentTarget)} type="button"><video aria-label={label} className="sand-attachment__video" height={attachment.height ?? undefined} muted preload="metadata" src={media.src} style={userMediaStyle} width={attachment.width ?? undefined} /></button>;
  if (media?.kind === "audio") return <audio aria-label={label} className="sand-attachment" data-attachment-label={attachmentLabel} controls preload="metadata" src={media.src} />;
  if (kind === "pdf" && onOpenPdf != null) return <button aria-label={`Open ${label}`} className="sand-file-attachment-chip sand-message-attachment" data-attachment-label={attachmentLabel} data-kind={kind} onClick={(event) => onOpenPdf(event.currentTarget)} type="button" title={attachment.path}><span aria-hidden="true">▤</span><span><strong>{label}</strong><small>{kind}{attachment.size == null ? "" : ` · ${formatAttachmentBytes(attachment.size)}`}</small></span></button>;
  if (loading) return <span aria-label="Loading media…" className="sand-attachment" data-attachment-label={attachmentLabel} role="status">Loading media…</span>;
  return <span aria-label={`Open ${label}`} className="sand-file-attachment-chip sand-message-attachment" data-attachment-label={attachmentLabel} data-kind={kind} role="group" title={attachment.path}><span aria-hidden="true">{kind === "image" ? "▧" : kind === "audio" ? "♪" : kind === "video" ? "▶" : "▤"}</span><span><strong>{label}</strong><small>{kind}{attachment.size == null ? "" : ` · ${formatAttachmentBytes(attachment.size)}`}</small></span></span>;
}

function AttachmentItem({ attachment, adjacency, mediaAttachments, resolveMedia, readAttachmentBytes, downloadAttachment, role, onOpen, onOpenPdf }: { attachment: GalleryAttachment; adjacency?: TranscriptAdjacency; mediaAttachments: readonly GalleryAttachment[]; resolveMedia?: MediaResolver; readAttachmentBytes?: PdfBytesResolver; downloadAttachment?: (path: string, suggestedName?: string) => Promise<boolean>; role: "user" | "assistant"; onOpen: (index: number, trigger: HTMLButtonElement) => void; onOpenPdf: (attachment: DraftAttachment, trigger: HTMLButtonElement) => void }) {
  const kind = inferAttachmentKind({ mimeType: attachment.mimeType, fileName: attachment.name, urlOrPath: attachment.path });
  const [media, setMedia] = useState<AttachmentMedia | null>(null);
  const [loading, setLoading] = useState(resolveMedia != null && (kind === "image" || kind === "video" || kind === "audio"));
  useEffect(() => {
    let active = true;
    if (resolveMedia == null || !["image", "video", "audio"].includes(kind)) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void resolveMedia(attachment.path).then((next) => { if (active) { setMedia(next); setLoading(false); } }).catch(() => { if (active) { setMedia(null); setLoading(false); } });
    return () => { active = false; };
  }, [attachment.path, kind, resolveMedia]);
  const mediaIndex = mediaAttachments.findIndex((candidate) => candidate.path === attachment.path);
  const isUserAttachment = attachment.sourceKind === "user-attachment";
  const isUserFile = isUserAttachment && !isPreviewable(kind);
  const className = isUserFile ? "sand-file-card-wrap sand-78zum5 sand-dt5ytf sand-uk3077 sand-11twubx sand-h8yej3 sand-1vyvmim sand-pvyfi4" : undefined;
  const card = <MediaCard attachment={attachment} kind={kind} loading={loading} media={media} onOpen={mediaIndex < 0 ? undefined : (trigger) => onOpen(mediaIndex, trigger)} onOpenPdf={kind === "pdf" && readAttachmentBytes != null && downloadAttachment != null ? (trigger) => onOpenPdf(attachment, trigger) : undefined} role={role} />;
  if (!isUserAttachment) return card;
  return <div className={className} data-group-start={adjacency?.isGroupStart || undefined} data-role="user" style={{ alignItems: "flex-end", alignSelf: "flex-end", justifyContent: "flex-end", ...(isPreviewable(kind) ? { maxWidth: 320 } : {}) }}>{card}</div>;
}

export function TranscriptAttachmentGallery({ attachments, adjacency, role, resolveMedia, readAttachmentBytes, downloadAttachment }: { attachments: readonly DraftAttachment[]; adjacency?: TranscriptAdjacency; role: "user" | "assistant"; resolveMedia?: MediaResolver; readAttachmentBytes?: (path: string, maxBytes: number) => Promise<AttachmentBytesResult | null>; downloadAttachment?: (path: string, suggestedName?: string) => Promise<boolean> }) {
  const galleryAttachments = attachments as readonly GalleryAttachment[];
  const mediaAttachments = galleryAttachments.filter((attachment) => isPreviewable(inferAttachmentKind({ mimeType: attachment.mimeType, fileName: attachment.name, urlOrPath: attachment.path })));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [openPdf, setOpenPdf] = useState<DraftAttachment | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setOpenIndex(null), []);
  const restoreFocus = useCallback(() => { triggerRef.current?.focus(); }, []);
  return <>
    <div aria-label={role === "assistant" ? "Agent attachments" : "Attachments"} className="sand-message-attachments" data-role={role} role="group"><div className="sand-message-attachments__strip">{galleryAttachments.map((attachment) => <AttachmentItem adjacency={adjacency} attachment={attachment} downloadAttachment={downloadAttachment} key={`${attachment.path}:${attachment.name}`} mediaAttachments={mediaAttachments} onOpen={(mediaIndex, trigger) => { triggerRef.current = trigger; setOpenIndex(mediaIndex); }} onOpenPdf={(pdf, trigger) => { triggerRef.current = trigger; setOpenPdf(pdf); }} readAttachmentBytes={readAttachmentBytes} resolveMedia={resolveMedia} role={role} />)}</div></div>
    {openIndex == null || resolveMedia == null ? null : <MediaViewer attachments={mediaAttachments} onClose={close} resolveMedia={resolveMedia} restoreFocus={restoreFocus} startIndex={openIndex} />}
    {openPdf == null || readAttachmentBytes == null || downloadAttachment == null ? null : <PdfAttachmentViewer name={openPdf.name || attachmentBasename(openPdf.path)} onClose={() => setOpenPdf(null)} onDownload={() => downloadAttachment(openPdf.path, openPdf.name || attachmentBasename(openPdf.path))} readBytes={readAttachmentBytes} restoreFocus={() => triggerRef.current?.focus()} source={openPdf.path} isOpen />}
  </>;
}
