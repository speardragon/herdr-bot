import { useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import type { ProductionCoordinatorClient } from "../../../production/coordinator-client";
import { SandButton, SandIconButton } from "../../ui/sand-kit-primitives";
import "./notification-host.css";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L132829-L132840
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L132838-L132847

export type RootShellNotificationAction =
  | { kind: "open-url"; label: string; url: string }
  | { kind: "dashboard-action"; label: string; action: string; args: Record<string, unknown>; successMessage: string | null };

export interface RootShellNotificationActionResult {
  ok: boolean;
  message: string | null;
}

export interface RootShellNotificationTray {
  kind: "error";
  id: string;
  title: string;
  detail?: string;
  requestId?: string;
  errorKind?: string;
  actions?: readonly RootShellNotificationAction[];
  count?: number;
}

export interface RootShellNotificationLifecycleSource {
  getTrays(): Promise<unknown>;
  subscribe(listener: (value: unknown) => void): () => void;
  subscribeTransport(listener: (state: "connected" | "down") => void): () => void;
}

export interface RootShellNotificationLifecycle {
  start(): void;
  accountChanged(kind: string): void;
  dispose(): void;
}

interface RecordValue {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function projectRootShellNotificationAction(value: unknown): RootShellNotificationAction | null {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.label !== "string" || value.label.length === 0) return null;
  if (value.kind === "open-url" && typeof value.url === "string") {
    try {
      const url = new URL(value.url);
      return ["http:", "https:"].includes(url.protocol) ? { kind: "open-url", label: value.label, url: value.url } : null;
    } catch {
      return null;
    }
  }
  if (value.kind !== "dashboard-action" || typeof value.action !== "string" || !isStringRecord(value.args)) return null;
  return {
    kind: "dashboard-action",
    label: value.label,
    action: value.action,
    args: { ...value.args },
    successMessage: typeof value.successMessage === "string" ? value.successMessage : null
  };
}

export function projectRootShellNotificationTray(value: unknown): RootShellNotificationTray | null {
  if (!isRecord(value) || value.kind !== "error" || typeof value.id !== "string" || value.id.length === 0 || typeof value.title !== "string" || value.title.length === 0) return null;
  return {
    kind: "error",
    id: value.id,
    title: value.title,
    ...(typeof value.detail === "string" && value.detail.length > 0 ? { detail: value.detail } : {}),
    ...(typeof value.requestId === "string" && value.requestId.length > 0 ? { requestId: value.requestId } : {}),
    ...(typeof value.errorKind === "string" && value.errorKind.length > 0 ? { errorKind: value.errorKind } : {}),
    ...(Array.isArray(value.actions) ? { actions: value.actions.map(projectRootShellNotificationAction).filter((action): action is RootShellNotificationAction => action != null).slice(0, 3) } : {}),
    ...(typeof value.count === "number" && Number.isFinite(value.count) && value.count > 1 ? { count: value.count } : {})
  };
}

export function projectRootShellNotificationTrays(value: unknown): RootShellNotificationTray[] {
  return Array.isArray(value) ? value.map(projectRootShellNotificationTray).filter((tray): tray is RootShellNotificationTray => tray != null) : [];
}

export function reduceRootShellNotificationEvent(
  trays: readonly RootShellNotificationTray[],
  value: unknown
): RootShellNotificationTray[] {
  if (!isRecord(value) || typeof value.type !== "string") return [...trays];
  if (value.type === "cleared") return [];
  if (value.type === "dismissed" && typeof value.id === "string") return trays.filter((tray) => tray.id !== value.id);
  if (value.type !== "pushed") return [...trays];
  const next = projectRootShellNotificationTray(value.tray);
  if (next == null) return [...trays];
  const index = trays.findIndex((tray) => tray.id === next.id);
  if (index < 0) return [...trays, next];
  return trays.map((tray, trayIndex) => trayIndex === index ? next : tray);
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5546178 (tray stack)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5576073 (getTrays coordinator contract)
export function createRootShellNotificationLifecycle(
  source: RootShellNotificationLifecycleSource,
  onTrays: (trays: RootShellNotificationTray[]) => void
): RootShellNotificationLifecycle {
  let active = false;
  let generation = 0;
  let fetching = false;
  let eventsEnabled = true;
  let queuedEvents: unknown[] = [];
  let stopTray: (() => void) | null = null;
  let stopTransport: (() => void) | null = null;
  let currentTrays: RootShellNotificationTray[] = [];
  const publish = (next: RootShellNotificationTray[]) => {
    currentTrays = next;
    onTrays(next);
  };

  const refresh = () => {
    if (!active || !eventsEnabled) return;
    const requestGeneration = ++generation;
    fetching = true;
    queuedEvents = [];
    void source.getTrays().then((value) => {
      if (!active || requestGeneration !== generation) return;
      let next = projectRootShellNotificationTrays(value);
      for (const event of queuedEvents) next = reduceRootShellNotificationEvent(next, event);
      queuedEvents = [];
      fetching = false;
      publish(next);
    }).catch(() => {
      if (active && requestGeneration === generation) {
        queuedEvents = [];
        fetching = false;
      }
    });
  };

  return {
    start(): void {
      if (active) return;
      active = true;
      eventsEnabled = true;
      stopTray = source.subscribe((value) => {
        if (!active || !eventsEnabled) return;
        if (fetching) queuedEvents.push(value);
        else publish(reduceRootShellNotificationEvent(currentTrays, value));
      });
      stopTransport = source.subscribeTransport((state) => {
        if (state === "connected") refresh();
      });
      refresh();
    },
    accountChanged(kind: string): void {
      if (!active) return;
      generation += 1;
      fetching = false;
      eventsEnabled = kind === "logged-in";
      queuedEvents = [];
      currentTrays = [];
      publish([]);
      if (kind === "logged-in") refresh();
    },
    dispose(): void {
      if (!active) return;
      active = false;
      generation += 1;
      fetching = false;
      queuedEvents = [];
      stopTray?.();
      stopTransport?.();
      stopTray = null;
      stopTransport = null;
    }
  };
}

export interface RootShellNotificationStackProps {
  trays: readonly RootShellNotificationTray[];
  copiedRequestId: string | null;
  isSandModelExperiment?: boolean;
  onClear(): void;
  onAction(action: RootShellNotificationAction): Promise<RootShellNotificationActionResult>;
  onCopyRequestId(requestId: string): void;
  onDismiss(id: string): void;
}

const UPGRADE_ACTION_ERROR = "Couldn’t complete the upgrade action — try again";

export function RootShellNotificationStack({ trays, copiedRequestId, isSandModelExperiment = false, onClear, onAction, onCopyRequestId, onDismiss }: RootShellNotificationStackProps) {
  if (trays.length === 0) return null;
  return <div aria-label="Notifications" className="sand-tray-stack" role="region">
    {trays.length > 1 ? <div className="sand-tray-stack__clear-all"><SandButton onClick={onClear} size="sm" variant="secondary">Clear all</SandButton></div> : null}
    {trays.map((tray) => <div className="sand-tray" data-kind="error" key={tray.id} role="alert">
      <div className="sand-tray__leading"><span aria-hidden="true" className="sand-tray__icon" style={{ fontFamily: "cursor-icons" }}>{String.fromCodePoint(0xea6c)}</span></div>
      <div className="sand-tray__body">
        <div className="sand-tray__title-row"><strong className="sand-tray__title">{tray.title}</strong>{tray.count == null ? null : <strong aria-label={`Occurred ${tray.count} times`} className="sand-tray__count">×{tray.count}</strong>}</div>
        {tray.detail == null ? null : <p className="sand-tray__detail">{tray.errorKind === "provider_overloaded" && isSandModelExperiment ? "The model provider is under heavy load right now. This is usually temporary — try again shortly." : tray.detail}</p>}
        {tray.actions == null || tray.actions.length === 0 ? null : <div className="sand-tray__actions">{tray.actions.map((action) => <NotificationActionButton action={action} key={`${action.kind}:${action.label}`} onAction={onAction} />)}</div>}
      </div>
      <div className="sand-tray__controls">
        {tray.requestId == null ? null : <SandIconButton aria-label="Copy request ID" className="sand-tray__copy" data-copied={copiedRequestId === tray.requestId || undefined} icon="copy" onClick={() => onCopyRequestId(tray.requestId!)} size="sm" />}
        <SandIconButton aria-label="Dismiss notification" className="sand-tray__dismiss" icon="close" onClick={() => onDismiss(tray.id)} size="sm" />
      </div>
    </div>)}
  </div>;
}

function NotificationActionButton({ action, onAction }: { action: RootShellNotificationAction; onAction(action: RootShellNotificationAction): Promise<RootShellNotificationActionResult> }) {
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const handleClick = () => {
    if (action.kind === "open-url") {
      void onAction(action).catch(() => {});
      return;
    }
    if (isPending) return;
    setNotice(null);
    setIsPending(true);
    void onAction(action).then((result) => {
      if (result.ok) {
        const message = result.message ?? action.successMessage;
        setNotice(message == null ? null : { tone: "info", text: message });
      } else setNotice({ tone: "error", text: result.message ?? UPGRADE_ACTION_ERROR });
    }).catch(() => setNotice({ tone: "error", text: UPGRADE_ACTION_ERROR })).finally(() => setIsPending(false));
  };
  return <div className="sand-tray__action-group"><SandButton disabled={isPending} onClick={handleClick} size="sm" variant="secondary">{action.label}</SandButton>{notice == null ? null : <span data-tone={notice.tone}>{notice.text}</span>}</div>;
}

export function isSandModelExperimentEnabled(value: unknown): boolean {
  return isRecord(value) && value.sandModelExperiment != null;
}

export function RootShellNotificationHost({ bridge, client }: { bridge: DesktopBridge; client: ProductionCoordinatorClient | null }) {
  const [trays, setTrays] = useState<RootShellNotificationTray[]>([]);
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null);
  const [isSandModelExperiment, setIsSandModelExperiment] = useState(() => isSandModelExperimentEnabled(bridge.experiments.initialSnapshot));

  useEffect(() => {
    if (client == null) return;
    const lifecycle = createRootShellNotificationLifecycle({
      getTrays: () => client.call("getTrays"),
      subscribe: (listener) => client.subscribe("tray", listener),
      subscribeTransport: (listener) => client.subscribeTransport(listener)
    }, setTrays);
    const stopAccount = bridge.cursorAccount.onStatusChanged((status) => lifecycle.accountChanged(status.kind));
    lifecycle.start();
    return () => { stopAccount(); lifecycle.dispose(); };
  }, [bridge, client]);

  useEffect(() => bridge.experiments.onChanged((snapshot) => setIsSandModelExperiment(isSandModelExperimentEnabled(snapshot))), [bridge]);

  const dismiss = (id: string) => {
    if (client == null) return;
    void client.call("dismissTray", { id }).catch(() => {});
  };
  const clear = () => {
    if (client == null) return;
    void client.call("clearTrays").catch(() => {});
  };
  const runAction = async (action: RootShellNotificationAction): Promise<RootShellNotificationActionResult> => {
    if (action.kind === "open-url") {
      await bridge.openExternal(action.url);
      return { ok: true, message: null };
    }
    const value = await bridge.cursorAccount.invokeDashboardAction({ action: action.action, args: { ...action.args } });
    if (typeof value !== "object" || value == null || Array.isArray(value) || typeof (value as { ok?: unknown }).ok !== "boolean") return { ok: false, message: null };
    const message = (value as { message?: unknown }).message;
    return { ok: (value as { ok: boolean }).ok, message: typeof message === "string" ? message : null };
  };
  const copyRequestId = (requestId: string) => {
    const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
    if (clipboard == null) return;
    void clipboard.writeText(requestId).then(() => setCopiedRequestId(requestId)).catch(() => {});
  };

  return <RootShellNotificationStack copiedRequestId={copiedRequestId} isSandModelExperiment={isSandModelExperiment} onAction={runAction} onClear={clear} onCopyRequestId={copyRequestId} onDismiss={dismiss} trays={trays} />;
}
