import { findConnectorCatalogEntry, findConnectorServer, normalizeConnectorNames } from "../connector-actions";
import { projectLeafEntry, useAdapterVersion, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";

// @evidence src/app/dist/renderer/assets/view-DqTN67x_.js#byteOffset=0 (connector list leaf)
// @evidence src/app/dist/renderer/assets/view-DqTN67x_.js#byteOffset=1515 (connector identity normalization and list projection)
// @evidence src/app/dist/renderer/assets/connector-card-BOH-l7tH.js#byteOffset=0 (connector card install/auth/status UI)
// @evidence src/app/dist/renderer/assets/connector-card-BOH-l7tH.js#byteOffset=12000 (authorization handoff/reopen/retry lifecycle)

function actionKey(connector: string, accountKey?: string): string {
  return `${connector.toLowerCase().replace(/[^a-z0-9]/g, "")}:${accountKey ?? "default"}`;
}

function actionLabel(server: ReturnType<typeof findConnectorServer>, catalog: ReturnType<typeof findConnectorCatalogEntry>): string | null {
  if (server != null && (server.status === "needsAuth" || server.status === "disconnected" || server.status === "error")) return "Authorize";
  if (catalog != null) return "Add";
  return null;
}

function ConnectorRow({ connector }: { connector: string }) {
  const providers = useTranscriptCardLeafProviders();
  const provider = providers?.connectors ?? null;
  const snapshot = provider?.getSnapshot();
  const server = findConnectorServer(snapshot?.data?.serverState ?? null, connector);
  const catalog = findConnectorCatalogEntry(snapshot?.data?.catalog ?? [], connector);
  const displayName = catalog?.displayName ?? server?.name ?? connector;
  const policyDisabled = server?.isTeamServer === true || server?.managedByTeamPluginPolicy === true || server?.status === "disabledByTeamAdminPolicy";
  const accountKey = server?.accountKey;
  const key = actionKey(connector, accountKey);
  const action = snapshot?.actions[key];
  const pending = snapshot?.pendingKeys.includes(key) === true;
  const connected = server?.status === "connected";
  const actionStatus = action != null && "status" in action ? action.status : undefined;
  const failed = action != null && "kind" in action && action.kind === "failed";
  const waiting = actionStatus === "waiting";
  const busy = pending || actionStatus === "installing" || actionStatus === "authenticating";
  const label = actionLabel(server, catalog);
  const connect = () => {
    if (provider == null || policyDisabled || label == null || busy) return;
    void provider.connect(connector, accountKey);
  };
  const retry = () => {
    if (provider == null || busy) return;
    void provider.retry(connector, accountKey);
  };
  const reopen = () => {
    if (provider == null || !waiting || action == null || !("accountKey" in action)) return;
    void provider.reopen(connector, action.accountKey);
  };
  return <article aria-busy={busy || undefined} aria-label={displayName} className="sand-connector-card">
    <div className="sand-connector-card__header"><div className="sand-2lah0s sand-78zum5"><span aria-hidden="true" data-connector={connector} /></div><div className="sand-connector-card__text"><h3>{displayName}</h3>{server?.isTeamServer === true ? <span className="sand-connector-card__team">Team</span> : null}{catalog?.description == null ? null : <p>{catalog.description}</p>}{server == null && catalog == null ? null : <span>{server?.toolCount === 1 ? "1 tool" : server == null || server.toolCount === 0 ? null : `${server.toolCount} tools`}</span>}</div>
      {connected ? <span className="sand-connector-card__status sand-3nfvp2 sand-6s0dn4 sand-2lah0s sand-1jnr06f sand-1yrsyyn sand-nuq7ks sand-10b6aqq sand-f18ygs sand-149ho13 sand-1buh4up sand-1w5rjie" role="status"><span aria-hidden="true" data-icon-name="check" />Added</span> : policyDisabled ? null : waiting ? <div className="sand-connector-card__handoff"><span>Waiting for {displayName} authorization…</span><button onClick={reopen} type="button">Reopen</button></div> : failed ? <div className="sand-connector-card__handoff"><span>Authorization didn't finish.</span><button onClick={retry} type="button">Retry</button></div> : label == null ? null : <button className="sand-2lah0s" disabled={busy} onClick={connect} type="button">{busy ? "" : label}</button>}
    </div>
  </article>;
}

export function ConnectorsTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const providers = useTranscriptCardLeafProviders();
  const provider = providers?.connectors ?? null;
  useAdapterVersion(provider);
  if (entry == null || entry.message.type !== "connectors") return null;
  const connectors = normalizeConnectorNames(entry.message.connectors);
  if (connectors.length === 0) return null;
  // @evidence src/app/dist/renderer/assets/view-DqTN67x_.js#byteOffset=0 (immutable list shell classes)
  return <div className="sand-connector-list sand-78zum5 sand-dt5ytf sand-167g77z sand-euugli">{connectors.map((connector) => <ConnectorRow connector={connector} key={connector} />)}</div>;
}

export default ConnectorsTranscriptCard;
