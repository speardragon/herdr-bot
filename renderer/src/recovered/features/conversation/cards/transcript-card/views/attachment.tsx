import { useEffect, useId, useState } from "react";
import type { AttachmentMedia } from "../../../../../contracts/desktop-bridge";
import type { AttachmentCardProjection } from "../attachment-data";
import { projectLeafEntry, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";
import LinkCardView from "./link-card";

// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=1242 (box card state projection)
// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=4426 (attachment URL classification and card branches)
// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=5253 (box status and screenshot presentation)
// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=5829 (media branch receives adjacency/timestamp and uses the shared media shell)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4546989 (image/video extension classification)
// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#SHA256=3de209b62671d33a486a008fa23d53f069bd77123bba36b9206b9d237bdf9706

const BOX_STATUS: Record<string, { label: string; tone: "done" | "muted" }> = {
  handed_back: { label: "Done", tone: "done" },
  replied: { label: "Answered", tone: "done" },
  dismissed: { label: "Skipped", tone: "muted" },
  closed: { label: "Closed", tone: "muted" },
};

function BoxAttachment({ projection }: { projection: Extract<AttachmentCardProjection, { kind: "box" }> }) {
  const titleId = useId();
  const resolution = projection.resolution ?? (projection.requestId == null ? "none" : "closed");
  const status = BOX_STATUS[resolution] ?? { label: "Status unavailable", tone: "muted" as const };
  const instruction = projection.instruction?.trim();
  const request = projection.request?.trim();
  const hasRequest = request != null && request.length > 0 && request !== instruction;
  return <article aria-labelledby={titleId} className="sand-box-card sand-78zum5 sand-dt5ytf sand-1v2ro7d sand-5c4s84 sand-193iq5w sand-c7ga6q sand-gqmno8 sand-dpxx8g sand-1heor9g" data-tone={status.tone}>
    <div className="sand-box-card__header sand-78zum5 sand-1cy8zhl sand-167g77z sand-h8yej3 sand-euugli"><h2 className="sand-box-card__title sand-dj266r sand-1yf7rl7 sand-at24cr sand-j3b58b sand-1iyjqo2 sand-s83m0k sand-dl72j9 sand-euugli sand-1wd3ewq sand-b3r6kr sand-lyipyv sand-uxw1ft" id={titleId}>Computer</h2><span className="sand-box-card__badge sand-3nfvp2 sand-6s0dn4 sand-17d4w8g sand-2lah0s sand-1nn3v0j sand-y13l1i sand-1120s5i sand-163pfp sand-149ho13" data-tone={status.tone}><span aria-hidden="true" className={`sand-1v4s8kt sand-ols6we sand-149ho13 sand-2lah0s ${status.tone === "done" ? "sand-1h27yg5" : "sand-xa9ouo"}`} />{status.label}</span></div>
    <div className="sand-box-card__heading">{instruction == null || instruction.length === 0 ? <span className="sand-box-card__subtitle">Linux desktop</span> : <><span className="sand-box-card__instruction">{instruction}</span>{hasRequest ? <span className="sand-box-card__request">{request}</span> : null}</>}</div>
    <div className="sand-box-card__frame sand-1n2onr6 sand-h8yej3 sand-o004bd sand-ur7f20 sand-b3r6kr sand-1ua6jya sand-78zum5 sand-6s0dn4 sand-l56j7k sand-4b2ntj sand-egtswm" data-tone={status.tone}>{projection.screenshotDataUrl == null ? <span aria-hidden="true" className="sand-box-card__placeholder sand-4b2ntj sand-1ks1olk" data-icon-name="device-desktop" data-size="lg" /> : <img alt="" aria-hidden className="sand-box-card__image sand-h8yej3 sand-5yr21d sand-l1xv1r sand-1lliihq" draggable={false} src={projection.screenshotDataUrl} />}</div>
  </article>;
}

function MediaAttachment({ projection, adjacency, timestampMs, resolveMedia }: { projection: Extract<AttachmentCardProjection, { kind: "media" }>; adjacency?: TranscriptCardLeafProps["adjacency"]; timestampMs?: number; resolveMedia: (url: string) => Promise<AttachmentMedia | null> }) {
  const [media, setMedia] = useState<AttachmentMedia | null>(null);
  const [state, setState] = useState<"loading" | "missing">("loading");
  useEffect(() => {
    let active = true;
    setMedia(null);
    setState("loading");
    void resolveMedia(projection.url).then((next) => {
      if (!active) return;
      if (next?.kind === "image" || next?.kind === "video" || next?.kind === "audio") setMedia(next);
      else setState("missing");
    }).catch(() => { if (active) setState("missing"); });
    return () => { active = false; };
  }, [projection.url, resolveMedia]);
  void timestampMs;
  const content = media?.kind === "image"
    ? <img alt={projection.alt ?? ""} className="sand-media-viewer__thumb-image" draggable={false} height={media.height ?? undefined} src={media.dataUrl} width={media.width ?? undefined} />
    : media?.kind === "video"
      ? <video aria-label={projection.alt ?? "Video attachment"} className="sand-media-viewer__thumb-video" controls height={media.height ?? undefined} preload="metadata" src={media.src} width={media.width ?? undefined} />
      : media?.kind === "audio"
        ? <audio controls src={media.src} />
        : <div aria-hidden="true" className="sand-media-viewer__thumb-fallback" data-state={state} />;
  return <div aria-label="Agent attachment" className="sand-attachment sand-zt30nv sand-78zum5 sand-dt5ytf sand-167g77z sand-qz0629 sand-ixl9f9 sand-1717udv sand-c342km sand-ng3xce sand-jbqb8w" data-group-start={adjacency?.isGroupStart || undefined} data-image={true} role="group">{content}</div>;
}

export function AttachmentTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const providers = useTranscriptCardLeafProviders();
  const adapter = providers?.attachments ?? null;
  if (entry == null || entry.message.type !== "attachment" || adapter == null) return null;
  const projection = adapter.project(entry);
  if (projection == null) return null;
  if (projection.kind === "legacy-link") {
    const urlCards = providers?.urlCards;
    return urlCards == null ? null : <LinkCardView provider={urlCards} url={projection.url} whenUnavailable="url-card" />;
  }
  if (projection.kind === "box") return <BoxAttachment projection={projection} />;
  if (projection.kind === "media") return <MediaAttachment adjacency={props.adjacency} projection={projection} resolveMedia={adapter.resolveMedia} timestampMs={projection.timestampMs} />;
  return <a href={projection.url}>{projection.url}</a>;
}

export default AttachmentTranscriptCard;
