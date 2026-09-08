import { useCallback, useId, useMemo, useState, useSyncExternalStore } from "react";
import type { ListenerIntegrationsSnapshot } from "../listener-integrations";
import type { ListenerPlatform } from "../protocol";
import { projectLeafEntry, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";

// @evidence src/app/dist/renderer/assets/view-3mdFcnEj.js#byteOffset=0 (listener-connect card leaf)
// @evidence src/app/dist/renderer/assets/view-3mdFcnEj.js#byteOffset=1515 (listener card projection)
// @evidence src/app/dist/renderer/assets/view-3mdFcnEj.js#byteOffset=1732 (connectPlatform action)
// @evidence src/app/dist/renderer/assets/view-3mdFcnEj.js#byteOffset=188 (GitHub branded icon)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=159113 (Slack branded icon)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5574385 (listener coordinator methods)

const EMPTY_SNAPSHOT: ListenerIntegrationsSnapshot = { status: "loading" };
const NOOP_SUBSCRIBE = () => () => {};

const PLATFORM_COPY: Record<ListenerPlatform, { displayName: string; blurb: string }> = {
  github: { displayName: "GitHub", blurb: "Let automations watch a repo's PRs, comments, issues, and CI." },
  slack: { displayName: "Slack", blurb: "Wake automations on Slack messages, mentions, and reactions." },
};

function useListenerSnapshot(provider: NonNullable<ReturnType<typeof useTranscriptCardLeafProviders>>["listenerIntegrations"] | null): ListenerIntegrationsSnapshot {
  const subscribe = useCallback((listener: () => void) => provider?.snapshots.subscribe(listener) ?? NOOP_SUBSCRIBE(), [provider]);
  const read = useCallback(() => provider?.snapshots.get() ?? EMPTY_SNAPSHOT, [provider]);
  return useSyncExternalStore(subscribe, read, read);
}

function platformBlurb(platform: ListenerPlatform, reason: string | undefined): string {
  if (reason != null && reason.length > 0) return `Connect ${PLATFORM_COPY[platform].displayName} ${reason}.`;
  return platform === "slack"
    ? "Link Slack so your agent can wake on messages, mentions, and reactions."
    : "Link GitHub so your agent can wake on PRs, comments, issues, and CI.";
}

const LISTENER_CARD_CLASS = "sand-listener-connect-card sand-78zum5 sand-1cy8zhl sand-883omv sand-wl9fdd sand-193iq5w sand-z9dl7a sand-sag5q8 sand-f18ygs sand-nuq7ks sand-mkeg23 sand-1y0btm7 sand-qz0629 sand-ixl9f9";

function PlatformIcon({ platform }: { platform: ListenerPlatform }) {
  if (platform === "github") {
    return <svg aria-label="GitHub" fill="var(--cursor-icon-primary)" height={18} role="img" viewBox="0 0 24 24" width={18} xmlns="http://www.w3.org/2000/svg"><path d="M12 .5C5.649.5.5 5.649.5 12c0 5.087 3.292 9.397 7.86 10.923.575.106.784-.25.784-.553 0-.273-.01-.996-.015-1.955-3.197.695-3.872-1.542-3.872-1.542-.523-1.329-1.277-1.683-1.277-1.683-1.044-.714.079-.7.079-.7 1.154.081 1.761 1.186 1.761 1.186 1.026 1.757 2.692 1.25 3.348.956.104-.743.401-1.25.73-1.537-2.552-.29-5.235-1.276-5.235-5.68 0-1.255.448-2.282 1.184-3.086-.119-.291-.513-1.46.113-3.044 0 0 .965-.309 3.162 1.179A11.02 11.02 0 0 1 12 6.077c.977.004 1.96.132 2.879.387 2.195-1.488 3.159-1.179 3.159-1.179.628 1.584.233 2.753.114 3.044.738.804 1.183 1.831 1.183 3.086 0 4.415-2.688 5.386-5.248 5.671.412.355.779 1.056.779 2.128 0 1.537-.014 2.777-.014 3.156 0 .306.207.665.79.552C20.212 21.393 23.5 17.086 23.5 12 23.5 5.649 18.351.5 12 .5Z" /></svg>;
  }
  return <svg aria-label="Slack" height={18} role="img" viewBox="0 0 127 127" width={18} xmlns="http://www.w3.org/2000/svg"><path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A" /><path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0" /><path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill="#2EB67D" /><path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E" /></svg>;
}

function ConnectedIcon() {
  return <span aria-hidden="true" data-color="green" data-icon-name="check-circle" data-size="sm" style={{ fontFamily: "cursor-icons" }}>{String.fromCodePoint(0xedba)}</span>;
}

export function ListenerConnectTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const providers = useTranscriptCardLeafProviders();
  const provider = providers?.listenerIntegrations ?? null;
  const snapshot = useListenerSnapshot(provider);
  const [isPending, setIsPending] = useState(false);
  const titleId = useId();
  const message = entry?.message.type === "listener-connect" ? entry.message : null;
  const copy = message == null ? null : PLATFORM_COPY[message.platform];
  const integration = useMemo(() => message == null ? undefined : (snapshot.status === "ready" ? snapshot.value : snapshot.status === "failed" ? snapshot.previous : undefined)?.integrations.find((candidate) => candidate.platform === message.platform), [message, snapshot]);
  if (entry == null || message == null || copy == null) return null;
  const connected = integration?.isConnected === true;
  const isLoading = (snapshot.status === "loading" || snapshot.status === "failed") && (snapshot.status === "loading" ? snapshot.previous == null : snapshot.previous == null);
  const available = integration != null || !isLoading;
  const title = connected ? `${copy.displayName} connected` : `Connect ${copy.displayName}`;
  const connect = () => {
    if (!available || isPending || props.isStale === true || provider == null) return;
    setIsPending(true);
    void provider.connectPlatform(message.platform).finally(() => setIsPending(false));
  };
  return <article aria-labelledby={titleId} className={`${LISTENER_CARD_CLASS}${connected ? " sand-6s0dn4" : ""}`}>
    <div className="sand-78zum5 sand-6s0dn4 sand-l56j7k sand-1849jeq sand-1gnnpzl sand-2lah0s sand-ur7f20 sand-arj5zm"><span aria-hidden="true" data-platform={message.platform}><PlatformIcon platform={message.platform} /></span></div>
    <div className="sand-78zum5 sand-dt5ytf sand-1ed6fcf sand-1iyjqo2 sand-s83m0k sand-euugli"><h3 id={titleId}>{title}</h3>{connected ? null : <p className="sand-euugli sand-1w2vvpw sand-13faqbe">{platformBlurb(message.platform, message.reason)}</p>}</div>
    {connected ? <span className="sand-78zum5 sand-6s0dn4 sand-1nejdyq sand-2lah0s sand-134ynso" role="status"><ConnectedIcon /><span>Connected</span></span> : available ? <button className="sand-2lah0s" disabled={isPending || props.isStale === true} onClick={connect} type="button">Connect</button> : <span aria-label="Checking connection status" className="sand-78zum5 sand-6s0dn4 sand-l56j7k sand-xk0z11 sand-1lqa7cf sand-cicffo sand-2lah0s" role="status">Checking connection status</span>}
  </article>;
}

export default ListenerConnectTranscriptCard;
