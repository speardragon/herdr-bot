import { findConnectorCatalogEntry, findConnectorServer, normalizeConnectorName, type ConnectorProvider } from "../connector-actions";
import type { ConnectorCardMessage } from "../protocol";
import { projectLeafEntry, useAdapterVersion, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";

// @evidence src/app/dist/renderer/assets/view-D9Ei08gq.js#byteOffset=0 (singular connector projection)
// @evidence src/app/dist/renderer/assets/connector-card-BOH-l7tH.js#byteOffset=9300 (Added/status presentation)
// @evidence src/app/dist/renderer/assets/connector-card-BOH-l7tH.js#byteOffset=11242 (authorization handoff/reopen/retry copy)
// @evidence src/app/dist/renderer/assets/connector-card-BOH-l7tH.js#byteOffset=1870 (suggestion projection)

type ConnectorServer = NonNullable<ReturnType<typeof findConnectorServer>>;

function actionKey(connector: string, accountKey?: string): string {
  return `${normalizeConnectorName(connector)}:${accountKey ?? "default"}`;
}

function findMessageServer(
  state: ConnectorServer[] | { servers: ConnectorServer[] } | null,
  connector: string,
  serverId?: string,
): ConnectorServer | null {
  const servers = state == null ? [] : Array.isArray(state) ? state : state.servers;
  if (serverId != null) {
    const exact = servers.find((server) => server.id === serverId || server.serverIdentifier === serverId || server.rowServerIdentifier === serverId);
    if (exact != null) return exact;
  }
  return findConnectorServer({ servers }, connector);
}

function actionLabel(server: ConnectorServer | null, catalog: ReturnType<typeof findConnectorCatalogEntry>): "Add" | "Authorize" | null {
  if (server != null && (server.status === "needsAuth" || server.status === "disconnected" || server.status === "error")) return "Authorize";
  if (server == null && catalog != null) return "Add";
  return null;
}

function suggestionNames(message: ConnectorCardMessage): string[] {
  const wanted = new Set([normalizeConnectorName(message.connector)]);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const suggestion of message.suggestions ?? []) {
    const normalized = normalizeConnectorName(suggestion);
    if (normalized.length === 0 || wanted.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(suggestion);
    if (result.length === 4) break;
  }
  return result;
}

function ConnectorCardBody({
  connector,
  provider,
  message,
  isStale,
}: {
  connector: string;
  provider: ConnectorProvider | null;
  message: ConnectorCardMessage;
  isStale: boolean;
}) {
  const snapshot = provider?.getSnapshot();
  const server = findMessageServer(snapshot?.data?.serverState?.servers ?? null, connector, message.serverId);
  const catalog = findConnectorCatalogEntry(snapshot?.data?.catalog ?? [], connector);
  const displayName = catalog?.displayName ?? server?.name ?? connector;
  const disabledByPolicy = server?.isTeamServer === true || server?.managedByTeamPluginPolicy === true || server?.status === "disabledByTeamAdminPolicy";
  const accountKey = server?.accountKey;
  const key = actionKey(connector, accountKey);
  const action = snapshot?.actions[key];
  const actionStatus = action != null && "status" in action ? action.status : undefined;
  const failed = action != null && "kind" in action && action.kind === "failed";
  const waiting = actionStatus === "waiting";
  const pending = snapshot?.pendingKeys.includes(key) === true;
  const busy = pending || actionStatus === "installing" || actionStatus === "authenticating";
  const connected = message.variant === "connected" || server?.status === "connected";
  const label = actionLabel(server, catalog);
  const description = message.reason?.trim() || catalog?.description;
  const suggestions = suggestionNames(message);

  const connect = () => {
    if (provider == null || isStale || disabledByPolicy || busy) return;
    if (server != null && label === "Authorize") void provider.authenticate(server.id, server.accountKey, connector);
    else if (label != null) void provider.connect(connector, accountKey);
  };
  const retry = () => {
    if (provider == null || isStale || busy) return;
    void provider.retry(connector, accountKey);
  };
  const reopen = () => {
    if (provider == null || isStale || !waiting || action == null || !("accountKey" in action)) return;
    void provider.reopen(connector, action.accountKey);
  };
  const connectSuggestion = (suggestion: string) => {
    if (provider == null || isStale || busy) return;
    void provider.connect(suggestion);
  };

  return <article aria-busy={busy || undefined} aria-label={displayName} className="sand-connector-card">
    <div className="sand-connector-card__header">
      <div className="sand-2lah0s sand-78zum5"><span aria-hidden="true" data-connector={connector} /></div>
      <div className="sand-connector-card__text">
        <h3>{displayName}</h3>
        {server?.isTeamServer === true ? <span className="sand-connector-card__team">Team</span> : null}
        {description == null ? null : <p>{description}</p>}
        {server == null || server.toolCount === 0 ? null : <span>{server.toolCount === 1 ? "1 tool" : `${server.toolCount} tools`}</span>}
      </div>
      {connected ? <span className="sand-connector-card__status sand-3nfvp2 sand-6s0dn4 sand-2lah0s sand-1jnr06f sand-1yrsyyn sand-nuq7ks sand-10b6aqq sand-f18ygs sand-149ho13 sand-1buh4up sand-1w5rjie" role="status" title="Connected"><span aria-hidden="true" data-icon-name="check" />Added</span>
        : disabledByPolicy ? null
          : waiting ? <div className="sand-connector-card__handoff"><span>Waiting for {displayName} authorization…</span><button disabled={isStale} onClick={reopen} type="button">Reopen</button></div>
            : failed ? <div className="sand-connector-card__handoff"><span>{displayName} authorization didn't finish.</span><button disabled={isStale} onClick={retry} type="button">Retry</button></div>
              : label == null ? null : <button className="sand-2lah0s" disabled={busy || isStale} onClick={connect} type="button">{label}</button>}
    </div>
    {suggestions.length === 0 ? null : <ul className="sand-connector-card__discovery">
      {suggestions.map((suggestion) => <li key={normalizeConnectorName(suggestion)}><button disabled={busy || isStale} onClick={() => connectSuggestion(suggestion)} type="button">{suggestion}</button></li>)}
    </ul>}
  </article>;
}

export function ConnectorTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const providers = useTranscriptCardLeafProviders();
  const provider = providers?.connectors ?? null;
  const version = useAdapterVersion(provider);
  if (entry == null || entry.message.type !== "connector") return null;
  void version;
  const message = entry.message;
  return <ConnectorCardBody connector={message.connector} isStale={props.isStale === true} message={message} provider={provider} />;
}

export default ConnectorTranscriptCard;
