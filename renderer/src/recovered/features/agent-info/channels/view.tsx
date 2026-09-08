import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  agentInfoChannelRowStatus,
  agentInfoChannelStatusDetail,
  agentInfoChannelStatusLabel,
  type AgentInfoChannelManifest,
  type AgentInfoChannelsController,
  type AgentInfoChannelConnection,
  type AgentInfoChannelsSnapshot
} from "./model";
import "./view.css";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2629126-2631040
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=3343445-3345790
// Mount contract for the immutable `_0n({agentId, labelledBy})` Channels tab.

export interface AgentInfoChannelsMount {
  readonly agentId: string;
  readonly labelledBy: string;
  readonly controller: AgentInfoChannelsController;
}

export type AgentInfoChannelsPanelProps = AgentInfoChannelsMount;

export function mountAgentInfoChannels(input: AgentInfoChannelsMount): ReactNode {
  return <AgentInfoChannelsPanel {...input} />;
}

export function AgentInfoChannelsPanel({ agentId, labelledBy, controller }: AgentInfoChannelsPanelProps) {
  const snapshot = useControllerSnapshot(controller);
  useEffect(() => {
    controller.setAgent(agentId);
    controller.open();
    return () => controller.close();
  }, [agentId, controller]);
  const view = snapshot.view ?? snapshot.previous;
  return <div aria-busy={snapshot.status === "loading"} className="sand-channels-tab">
    <p>Connect this agent to a messaging platform so it can talk to people there. You can also just ask it in chat, like "connect me to a messaging platform".</p>
    {snapshot.status === "failed" && view == null ? <div aria-live="polite" role="alert">
      <span>{snapshot.error instanceof Error ? snapshot.error.message : String(snapshot.error)}</span>
      <button onClick={() => void controller.retry().catch(() => {})} type="button">Retry</button>
    </div> : null}
    {view == null ? null : view.manifests.length === 0
      ? <div><span>No connectors available.</span></div>
      : <ul aria-labelledby={labelledBy}>
        {view.manifests.map((manifest) => <AgentInfoChannelRow controller={controller} connection={view.connections.find((item) => item.platform === manifest.platform)} key={manifest.platform} manifest={manifest} />)}
      </ul>}
  </div>;
}

function AgentInfoChannelRow({ controller, manifest, connection }: { controller: AgentInfoChannelsController; manifest: AgentInfoChannelManifest; connection?: AgentInfoChannelConnection }) {
  const status = agentInfoChannelRowStatus(manifest, connection);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [token, setToken] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const pending = controller.getSnapshot().pending;
  const busy = pending.some((key) => key.endsWith(`:${manifest.platform}`));
  const connected = status.kind === "connected" || status.kind === "connecting";
  const connect = () => {
    if (token.trim().length === 0 || busy) return;
    const value = token;
    setToken("");
    setCredentialOpen(false);
    void controller.connect(manifest.platform, value).catch(() => {});
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); connect(); }
  };
  const onActionsBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setActionsOpen(false);
  };
  const detail = agentInfoChannelStatusDetail(status, manifest, connection);
  return <li aria-labelledby={inputId} className="sand-channel-row">
    <div>
      <span aria-hidden="true">◌</span>
      <span><span id={inputId}>{manifest.displayName}</span><small>{detail}</small></span>
    </div>
    {agentInfoChannelStatusLabel(status) == null ? null : <span aria-label={agentInfoChannelStatusLabel(status) as string} role="status">{agentInfoChannelStatusLabel(status)}</span>}
    <span>
      {status.kind === "available" || status.kind === "error" ? <>
        <button disabled={busy} onClick={() => setCredentialOpen(true)} type="button">{status.kind === "error" ? "Reconnect" : "Connect"}</button>
        {status.kind === "error" ? <button disabled={busy} onClick={() => void controller.disconnect(manifest.platform).catch(() => {})} type="button">Disconnect</button> : null}
      </> : null}
      <span onBlur={onActionsBlur} onFocus={() => setActionsOpen(true)}>
        <button aria-expanded={actionsOpen} aria-haspopup="menu" aria-label="Connection actions" onClick={() => setActionsOpen((open) => !open)} ref={actionsTriggerRef} type="button">⋯</button>
      {actionsOpen ? <div aria-label="Connection actions" role="menu">
        <button onClick={() => { setActionsOpen(false); setGuideOpen(true); }} role="menuitem" type="button">How to connect</button>
        {connected ? <>
          <button disabled={busy} onClick={() => { setActionsOpen(false); void controller.refresh(manifest.platform).catch(() => {}); }} role="menuitem" type="button">Refresh</button>
          <button disabled={busy} onClick={() => { setActionsOpen(false); void controller.disconnect(manifest.platform).catch(() => {}); }} role="menuitem" type="button">Disconnect</button>
        </> : null}
      </div> : null}
      </span>
    </span>
    {credentialOpen && status.kind !== "coming-soon" ? <div>
      <input autoComplete="off" onChange={(event) => setToken(event.currentTarget.value)} onKeyDown={onKeyDown} placeholder={`Paste your ${manifest.credentialLabel}`} spellCheck={false} type="password" value={token} />
      <small>Stored securely, never shown to your agent.</small>
      <button onClick={() => { setToken(""); setCredentialOpen(false); }} type="button">Cancel</button>
      <button disabled={token.trim().length === 0 || busy} onClick={connect} type="button">Store securely</button>
    </div> : null}
    {guideOpen ? <ChannelGuideDialog manifest={manifest} onClose={() => setGuideOpen(false)} restoreRef={actionsTriggerRef} statusKind={status.kind} /> : null}
  </li>;
}

function ChannelGuideDialog({ manifest, onClose, restoreRef, statusKind }: {
  manifest: AgentInfoChannelManifest;
  onClose(): void;
  restoreRef: React.RefObject<HTMLButtonElement | null>;
  statusKind: ReturnType<typeof agentInfoChannelRowStatus>["kind"];
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === event.currentTarget) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
      restoreRef.current?.focus();
    };
  }, [onClose, restoreRef]);
  const isComingSoon = statusKind === "coming-soon";
  return <div aria-label={`Connect ${manifest.displayName}`} aria-modal="true" className="sand-channel-guide-dialog" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} ref={dialogRef} role="dialog" tabIndex={-1}>
    <h3>Connect {manifest.displayName}</h3>
    <p>{channelGuideDescription(isComingSoon, manifest.displayName)}</p>
    {isComingSoon ? <strong>Coming soon</strong> : <ol>{(manifest.setupGuide?.steps ?? manifest.connectGuide.split("\n").filter(Boolean).map((text): { readonly text: string } => ({ text }))).map((step, index) => <li key={`${step.text}:${index}`}>{step.text}{"code" in step && step.code != null ? <code>{step.code}</code> : null}</li>)}</ol>}
    <button onClick={onClose} type="button">Got it</button>
  </div>;
}

function channelGuideDescription(isComingSoon: boolean, displayName: string): string {
  return isComingSoon ? `Connecting ${displayName} is not available yet.` : `Follow these steps to connect ${displayName}.`;
}

function useControllerSnapshot(controller: AgentInfoChannelsController): AgentInfoChannelsSnapshot {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot);
  useEffect(() => controller.subscribe(() => setSnapshot(controller.getSnapshot())), [controller]);
  return snapshot;
}
