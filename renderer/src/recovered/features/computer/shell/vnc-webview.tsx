// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L520
import { forwardRef, useCallback, type Ref, type RefAttributes } from "react";
import type { DesktopBridge } from "../../../contracts/desktop-bridge";
import {
  VNC_CRASH_LIMIT,
  VNC_CRASH_WINDOW_MS,
  VNC_HOST_KEY_CHANNEL,
  VNC_LIVENESS_CHANNEL,
  VNC_PARTITION,
  VNC_SESSION_CHANNEL,
  VNC_VIEWER_VISIBLE_CHANNEL,
  VNC_WEB_PREFERENCES,
  parseVncLiveness,
  parseVncSession,
  vncIdentity,
  vncViewerUrl
} from "./model";

export interface VncWebviewElement extends HTMLElement {
  isConnected: boolean;
  reload?(): void;
  send?(channel: string, value: unknown): Promise<void> | void;
}

interface VncWebviewProps {
  bridge: DesktopBridge;
  src: string;
  className?: string;
  isInteractive?: boolean;
  isViewerVisible?: boolean;
  openedAtMs?: number;
  onReadyChange?(ready: boolean): void;
  onConnectedChange?(connected: boolean): void;
  onCrashedChange?(crashed: boolean): void;
  onHostKey?(key: string): void;
}

type WebviewTagProps = {
  "aria-hidden"?: boolean;
  className: string;
  partition: string;
  ref: Ref<VncWebviewElement>;
  src: string;
  tabIndex?: number;
  webpreferences: string;
} & RefAttributes<VncWebviewElement>;

const WebviewTag = "webview" as unknown as (props: WebviewTagProps) => React.ReactNode;

interface VncLifecycle {
  src: string;
  startedAtMs: number;
  domReadyReported: boolean;
  isReady: boolean;
  hasConnected: boolean;
  crashCount: number;
  lastCrashAtMs: number | null;
  hasCrashedOut: boolean;
  wasViewerVisible: boolean;
}

const lifecycleByWebview = new WeakMap<VncWebviewElement, VncLifecycle>();

export function isVncWebviewReady(element: VncWebviewElement): boolean {
  return lifecycleByWebview.get(element)?.isReady === true;
}

function settle(value: Promise<void> | void): void {
  if (value != null) void value.catch(() => {});
}

function sendViewerVisibility(element: VncWebviewElement, visible: boolean): void {
  const result = element.send?.(VNC_VIEWER_VISIBLE_CHANNEL, visible);
  if (result != null) settle(result);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref != null) ref.current = value;
}

export function bindVncWebviewLifecycle(element: VncWebviewElement, options: Pick<VncWebviewProps,
  "bridge" | "src" | "isInteractive" | "isViewerVisible" | "openedAtMs" | "onReadyChange" |
  "onConnectedChange" | "onCrashedChange" | "onHostKey">): () => void {
  const {
    bridge,
    src,
    isInteractive = false,
    isViewerVisible,
    openedAtMs,
    onReadyChange,
    onConnectedChange,
    onCrashedChange,
    onHostKey
  } = options;
  let lifecycle = lifecycleByWebview.get(element);
  const didNavigate = lifecycle == null || lifecycle.src !== src;
  if (didNavigate) {
    lifecycle = {
      src,
      startedAtMs: performance.now(),
      domReadyReported: false,
      isReady: false,
      hasConnected: false,
      crashCount: 0,
      lastCrashAtMs: null,
      hasCrashedOut: false,
      wasViewerVisible: false
    };
    lifecycleByWebview.set(element, lifecycle);
  }
  const state = lifecycle!;
  const identity = vncIdentity(src);
  const surface = isInteractive ? "interactive" : "preview";
  const report = (phase: string, extra: { failCode?: string; clean?: boolean } = {}) => {
    settle(bridge.telemetry.reportVncSession({
      surface,
      phase,
      ...(identity.host == null ? {} : { vncHost: identity.host }),
      ...(identity.display == null ? {} : { display: identity.display }),
      ...(phase === "navigate" ? {} : { durationMs: Math.max(0, performance.now() - state.startedAtMs) }),
      ...(surface === "interactive" && openedAtMs != null ? { sinceOpenMs: Math.max(0, performance.now() - openedAtMs) } : {}),
      ...extra
    }));
  };
  const sendVisibility = () => {
    if (isViewerVisible != null && state.isReady) sendViewerVisibility(element, isViewerVisible);
  };
  const becameVisible = isViewerVisible === true && !state.wasViewerVisible;
  state.wasViewerVisible = isViewerVisible === true;
  if (didNavigate) report("navigate");
  else if (state.hasCrashedOut && becameVisible) {
    state.hasCrashedOut = false;
    state.crashCount = 0;
    state.lastCrashAtMs = null;
    element.reload?.();
  } else {
    if (state.isReady) onReadyChange?.(true);
    if (state.hasConnected) onConnectedChange?.(true);
    if (state.hasCrashedOut) onCrashedChange?.(true);
  }
  sendVisibility();

  const reportDomReady = () => {
    if (!state.domReadyReported) {
      state.domReadyReported = true;
      report("dom_ready");
    }
  };
  const onDomReady = () => {
    state.isReady = true;
    onReadyChange?.(true);
    reportDomReady();
    sendVisibility();
  };
  const onDidFinishLoad = () => {
    state.isReady = true;
    reportDomReady();
    sendVisibility();
  };
  const onDidFailLoad = (event: Event) => {
    const errorCode = (event as Event & { errorCode?: number }).errorCode;
    if (errorCode !== -3) report("load_fail", errorCode == null ? {} : { failCode: String(errorCode) });
  };
  const onRenderProcessGone = (event: Event) => {
    if ((event as Event & { details?: { reason?: string } }).details?.reason === "clean-exit") return;
    state.isReady = false;
    state.hasConnected = false;
    onReadyChange?.(false);
    onConnectedChange?.(false);
    const now = performance.now();
    const recent = state.lastCrashAtMs != null && now - state.lastCrashAtMs < VNC_CRASH_WINDOW_MS;
    state.lastCrashAtMs = now;
    state.crashCount = recent ? state.crashCount + 1 : 1;
    if (state.crashCount > VNC_CRASH_LIMIT) {
      state.hasCrashedOut = true;
      onCrashedChange?.(true);
    } else element.reload?.();
  };
  const onIpcMessage = (event: Event) => {
    const ipc = event as Event & { channel?: string; args?: unknown[] };
    const value = ipc.args?.[0];
    if (ipc.channel === VNC_HOST_KEY_CHANNEL) {
      if (typeof value === "string") onHostKey?.(value);
      return;
    }
    if (ipc.channel === VNC_LIVENESS_CHANNEL) {
      const reportValue = parseVncLiveness(value);
      if (reportValue != null) settle(bridge.telemetry.reportVncLiveness(reportValue));
      return;
    }
    if (ipc.channel === VNC_SESSION_CHANNEL) {
      const session = parseVncSession(value);
      if (session == null) return;
      report(session.phase, session.clean == null ? {} : { clean: session.clean });
      if (session.phase !== "rfb_disconnect" && !state.hasConnected) {
        state.hasConnected = true;
        onConnectedChange?.(true);
      }
    }
  };

  element.addEventListener("dom-ready", onDomReady);
  element.addEventListener("did-finish-load", onDidFinishLoad);
  element.addEventListener("did-fail-load", onDidFailLoad);
  element.addEventListener("render-process-gone", onRenderProcessGone);
  element.addEventListener("ipc-message", onIpcMessage);
  return () => {
    element.removeEventListener("dom-ready", onDomReady);
    element.removeEventListener("did-finish-load", onDidFinishLoad);
    element.removeEventListener("did-fail-load", onDidFailLoad);
    element.removeEventListener("render-process-gone", onRenderProcessGone);
    element.removeEventListener("ipc-message", onIpcMessage);
    onReadyChange?.(false);
    onConnectedChange?.(false);
    onCrashedChange?.(false);
  };
}

export const VncWebview = forwardRef<VncWebviewElement, VncWebviewProps>(function VncWebview(props, forwardedRef) {
  const {
    bridge,
    src,
    className,
    isInteractive = false,
    isViewerVisible,
    openedAtMs,
    onReadyChange,
    onConnectedChange,
    onCrashedChange,
    onHostKey
  } = props;

  const attach = useCallback((element: VncWebviewElement | null) => {
    assignRef(forwardedRef, element);
    if (element == null) return;
    const detach = bindVncWebviewLifecycle(element, {
      bridge, src, isInteractive, isViewerVisible, openedAtMs,
      onReadyChange, onConnectedChange, onCrashedChange, onHostKey
    });
    return () => {
      detach();
      assignRef(forwardedRef, null);
    };
  }, [bridge, forwardedRef, isInteractive, isViewerVisible, onConnectedChange, onCrashedChange, onHostKey, onReadyChange, openedAtMs, src]);

  return <WebviewTag
    aria-hidden={isInteractive ? undefined : true}
    className={className == null
      ? "sand-box-vnc sand-3nfvp2 sand-h8yej3 sand-5yr21d sand-ng3xce"
      : `sand-box-vnc sand-3nfvp2 sand-h8yej3 sand-5yr21d sand-ng3xce ${className}`}
    partition={VNC_PARTITION}
    ref={attach}
    src={vncViewerUrl(src, isInteractive)}
    tabIndex={isInteractive ? undefined : -1}
    webpreferences={VNC_WEB_PREFERENCES}
  />;
});
