import type { RawPortCoordinatorSource } from "../../../runtime/coordinator-source";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L1
// The immutable Agent-info Channels tab uses the channels resource and these
// four coordinator methods. The channel surface is not the MCP server/tool
// surface: it has no channel-side enable/disable, OAuth callback, or tool RPC.

export type AgentInfoChannelAvailability = "available" | "coming-soon";
export type AgentInfoChannelConnectionStatus = "connected" | "error" | string;

export interface AgentInfoChannelSetupStep {
  readonly text: string;
  readonly code?: string;
}

export interface AgentInfoChannelManifest {
  readonly platform: string;
  readonly displayName: string;
  readonly blurb: string;
  readonly credentialLabel: string;
  readonly availability: AgentInfoChannelAvailability;
  readonly connectGuide: string;
  readonly setupGuide?: { readonly steps?: readonly AgentInfoChannelSetupStep[] };
}

export interface AgentInfoChannelConnection {
  readonly platform: string;
  readonly label: string;
  readonly status: AgentInfoChannelConnectionStatus;
  readonly detail?: string | null;
}

export interface AgentInfoChannelsView {
  readonly manifests: readonly AgentInfoChannelManifest[];
  readonly connections: readonly AgentInfoChannelConnection[];
}

export interface AgentInfoChannelsSource {
  getAgentChannels(args: { readonly id: string }): Promise<unknown>;
  connectChannel(args: { readonly id: string; readonly platform: string; readonly token: string }): Promise<unknown>;
  disconnectChannel(args: { readonly id: string; readonly platform: string }): Promise<unknown>;
  refreshChannel(args: { readonly id: string; readonly platform: string }): Promise<unknown>;
}

export interface AgentInfoChannelsSnapshot {
  readonly agentId: string;
  readonly status: "idle" | "loading" | "ready" | "failed";
  readonly view: AgentInfoChannelsView | null;
  readonly previous: AgentInfoChannelsView | null;
  readonly pending: readonly string[];
  readonly error: unknown | null;
}

export type AgentInfoChannelsOperation = "connect" | "disconnect" | "refresh";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function channelManifest(value: unknown): AgentInfoChannelManifest | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.platform !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.blurb !== "string" ||
    typeof value.credentialLabel !== "string" ||
    (value.availability !== "available" && value.availability !== "coming-soon") ||
    typeof value.connectGuide !== "string"
  ) return null;
  const setupGuide = isRecord(value.setupGuide) && Array.isArray(value.setupGuide.steps)
    ? { steps: value.setupGuide.steps.flatMap((step) => {
      if (!isRecord(step) || typeof step.text !== "string") return [];
      return [{ text: step.text, ...(typeof step.code === "string" ? { code: step.code } : {}) }];
    }) }
    : undefined;
  return {
    platform: value.platform,
    displayName: value.displayName,
    blurb: value.blurb,
    credentialLabel: value.credentialLabel,
    availability: value.availability,
    connectGuide: value.connectGuide,
    ...(setupGuide === undefined ? {} : { setupGuide })
  };
}

function channelConnection(value: unknown): AgentInfoChannelConnection | null {
  if (!isRecord(value) || typeof value.platform !== "string" || typeof value.label !== "string" || typeof value.status !== "string") return null;
  return {
    platform: value.platform,
    label: value.label,
    status: value.status,
    ...(value.detail == null || typeof value.detail === "string" ? { detail: value.detail ?? null } : {})
  };
}

/** Strictly projects the typed `channels-view` reply; malformed rows fail closed. */
export function projectAgentInfoChannelsView(value: unknown): AgentInfoChannelsView | null {
  if (!isRecord(value) || !Array.isArray(value.manifests) || !Array.isArray(value.connections)) return null;
  const manifests = value.manifests.map(channelManifest);
  const connections = value.connections.map(channelConnection);
  if (manifests.some((item) => item == null) || connections.some((item) => item == null)) return null;
  return {
    manifests: manifests as AgentInfoChannelManifest[],
    connections: connections as AgentInfoChannelConnection[]
  };
}

export function hasAgentInfoChannelsToShow(view: AgentInfoChannelsView): boolean {
  return view.manifests.some((manifest) => manifest.availability === "available") || view.connections.length > 0;
}

export type AgentInfoChannelRowStatus =
  | { readonly kind: "coming-soon" }
  | { readonly kind: "available" }
  | { readonly kind: "connected" }
  | { readonly kind: "error"; readonly detail?: string | null }
  | { readonly kind: "connecting" };

// Immutable A0n/P0n/O0n: coming-soon wins, then connected/error, otherwise
// an existing non-connected row is connecting and an absent row is available.
export function agentInfoChannelRowStatus(
  manifest: Pick<AgentInfoChannelManifest, "availability">,
  connection: Pick<AgentInfoChannelConnection, "status" | "detail"> | undefined
): AgentInfoChannelRowStatus {
  if (manifest.availability === "coming-soon") return { kind: "coming-soon" };
  if (connection?.status === "connected") return { kind: "connected" };
  if (connection?.status === "error") return { kind: "error", detail: connection.detail ?? null };
  return connection == null ? { kind: "available" } : { kind: "connecting" };
}

export function agentInfoChannelStatusLabel(status: AgentInfoChannelRowStatus): string | null {
  switch (status.kind) {
    case "coming-soon": return "Soon";
    case "connected": return "Connected";
    case "error": return "Needs attention";
    case "connecting": return "Connecting";
    case "available": return null;
  }
}

export function agentInfoChannelStatusDetail(
  status: AgentInfoChannelRowStatus,
  manifest: Pick<AgentInfoChannelManifest, "blurb">,
  connection?: Pick<AgentInfoChannelConnection, "label" | "detail">
): string {
  if (status.kind === "connected" && connection != null) return `Connected as ${connection.label}`;
  if (status.kind === "error") return connection?.detail ?? "The platform rejected this connection.";
  return manifest.blurb;
}

export function createAgentInfoChannelsSource(source: RawPortCoordinatorSource): AgentInfoChannelsSource {
  return {
    getAgentChannels: (args) => source.getAgentChannels(args),
    connectChannel: (args) => source.connectChannel(args),
    disconnectChannel: (args) => source.disconnectChannel(args),
    refreshChannel: (args) => source.refreshChannel(args)
  };
}

export interface AgentInfoChannelsController {
  getSnapshot(): AgentInfoChannelsSnapshot;
  subscribe(listener: () => void): () => void;
  open(): void;
  close(): void;
  setAgent(agentId: string): void;
  load(): Promise<AgentInfoChannelsView | null>;
  retry(): Promise<AgentInfoChannelsView | null>;
  connect(platform: string, token: string): Promise<boolean>;
  disconnect(platform: string): Promise<boolean>;
  refresh(platform: string): Promise<boolean>;
  dispose(): void;
}

export function createAgentInfoChannelsController(
  source: AgentInfoChannelsSource,
  agentId: string
): AgentInfoChannelsController {
  const listeners = new Set<() => void>();
  const pending = new Set<string>();
  let currentAgentId = agentId;
  let opened = false;
  let disposed = false;
  let lifecycleGeneration = 0;
  let requestGeneration = 0;
  let snapshot: AgentInfoChannelsSnapshot = {
    agentId,
    status: "idle",
    view: null,
    previous: null,
    pending: [],
    error: null
  };

  const emit = () => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };
  const publish = (next: AgentInfoChannelsSnapshot) => {
    if (disposed) return;
    snapshot = next;
    emit();
  };
  const publishPending = () => publish({ ...snapshot, pending: [...pending] });
  const current = (generation: number, request?: number) =>
    !disposed && opened && generation === lifecycleGeneration && (request === undefined || request === requestGeneration);
  const setView = (view: AgentInfoChannelsView, generation: number, request?: number): boolean => {
    if (!current(generation, request)) return false;
    publish({ agentId: currentAgentId, status: "ready", view, previous: view, pending: [...pending], error: null });
    return true;
  };

  const load = async (): Promise<AgentInfoChannelsView | null> => {
    if (disposed || !opened) return snapshot.view;
    const generation = lifecycleGeneration;
    const request = ++requestGeneration;
    publish({ ...snapshot, agentId: currentAgentId, status: "loading", error: null, pending: [...pending] });
    try {
      const view = projectAgentInfoChannelsView(await source.getAgentChannels({ id: currentAgentId }));
      if (view == null) throw new Error("Malformed Agent-info Channels reply");
      if (!setView(view, generation, request)) return null;
      return view;
    } catch (error) {
      if (current(generation, request)) publish({ ...snapshot, status: "failed", error, pending: [...pending] });
      throw error;
    }
  };

  const run = async (operation: AgentInfoChannelsOperation, platform: string, token?: string): Promise<boolean> => {
    if (disposed || !opened || platform.trim().length === 0) return false;
    if (operation === "connect" && token?.trim().length === 0) return false;
    const key = `${operation}:${platform}`;
    const generation = lifecycleGeneration;
    const request = ++requestGeneration;
    pending.add(key);
    publishPending();
    try {
      const raw = operation === "connect"
        ? await source.connectChannel({ id: currentAgentId, platform, token: token as string })
        : operation === "disconnect"
          ? await source.disconnectChannel({ id: currentAgentId, platform })
          : await source.refreshChannel({ id: currentAgentId, platform });
      const view = projectAgentInfoChannelsView(raw);
      if (view == null) throw new Error("Malformed Agent-info Channels reply");
      return setView(view, generation, request);
    } catch (error) {
      if (current(generation, request)) publish({ ...snapshot, status: "failed", error, pending: [...pending] });
      throw error;
    } finally {
      pending.delete(key);
      if (current(generation)) publishPending();
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open() {
      if (disposed || opened) return;
      opened = true;
      lifecycleGeneration += 1;
      void load().catch(() => {});
    },
    close() {
      if (!opened) return;
      opened = false;
      lifecycleGeneration += 1;
      requestGeneration += 1;
      pending.clear();
      publish({ agentId: currentAgentId, status: "idle", view: null, previous: null, pending: [], error: null });
    },
    setAgent(nextAgentId) {
      if (disposed || nextAgentId === currentAgentId) return;
      currentAgentId = nextAgentId;
      lifecycleGeneration += 1;
      requestGeneration += 1;
      pending.clear();
      publish({ agentId: currentAgentId, status: opened ? "loading" : "idle", view: null, previous: null, pending: [], error: null });
      if (opened) void load().catch(() => {});
    },
    load,
    retry: load,
    connect: (platform, token) => run("connect", platform, token),
    disconnect: (platform) => run("disconnect", platform),
    refresh: (platform) => run("refresh", platform),
    dispose() {
      if (disposed) return;
      disposed = true;
      opened = false;
      lifecycleGeneration += 1;
      requestGeneration += 1;
      pending.clear();
      listeners.clear();
    }
  };
}
