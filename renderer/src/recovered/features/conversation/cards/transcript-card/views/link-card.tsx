import { useEffect, useState, type MouseEvent } from "react";
import type { LinkMetadataResourceSnapshot, UrlCardProvider } from "../url-card";

// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#L1 (send-message:text URL-card consumer)
// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=4426 (legacy-link URL-card consumer)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5059259 (shared link metadata presentation)

function LinkCardBody({ url, snapshot }: { url: string; snapshot: LinkMetadataResourceSnapshot }) {
  const metadata = snapshot.status === "ready" ? snapshot.value : null;
  const title = metadata?.title ?? metadata?.siteName ?? metadata?.hostname ?? url;
  const hostname = metadata?.hostname ?? metadata?.siteName;
  return <>
    {metadata?.imageDataUrl != null ? <span aria-hidden="true" className="sand-link-card__image"><img alt="" className="sand-link-card__image-img" src={metadata.imageDataUrl} /></span> : null}
    <span className="sand-link-card__body">
      <strong className="sand-link-card__title">{title}</strong>
      {metadata?.description == null ? null : <span className="sand-link-card__description">{metadata.description}</span>}
      {hostname == null ? null : <span className="sand-link-card__meta"><span className="sand-link-card__hostname">{hostname}</span></span>}
    </span>
  </>;
}

export function LinkCardView({ provider, url, isGroupStart, whenUnavailable }: { provider: UrlCardProvider; url: string; isGroupStart?: boolean; whenUnavailable?: "url-card" }) {
  // @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=4426 (legacy-link passes whenUnavailable:"url-card")
  void whenUnavailable;
  const resource = provider.stateFor(url);
  const [, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const unsubscribe = resource.subscribe(() => { if (active) setRevision((value) => value + 1); });
    void resource.load();
    return () => { active = false; unsubscribe(); };
  }, [resource]);
  const snapshot = resource.get();
  const openExternal = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void provider.openExternal(url);
  };
  return <div className="sand-link-card-wrap" data-group-start={isGroupStart || undefined}><a aria-busy={snapshot.status === "loading" || undefined} aria-label={url} className="sand-link-card" href={url} onClick={openExternal}>
    <LinkCardBody snapshot={snapshot} url={url} />
  </a></div>;
}

export default LinkCardView;
