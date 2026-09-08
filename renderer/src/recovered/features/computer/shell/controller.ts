import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DesktopBridge } from "../../../contracts/desktop-bridge";
import type { TranscriptComputerHandoff } from "../../conversation/workspace/model";
import type { ProductionCoordinatorClient } from "../../../../production/coordinator-client";
import {
  projectComputerMonitors,
  projectComputerCursor,
  projectComputerStatus,
  projectHandoff,
  isComputerUseTaskActive,
  type ComputerHandoffResolution,
  type ComputerCursor,
  type ComputerMonitor,
  type ComputerStatusProjection
} from "./model";
import {
  EMPTY_COMPUTER_STATUS_SNAPSHOT,
  EMPTY_COMPUTER_STATUS_SUBSCRIBE,
  createComputerStatusStore,
  useComputerActiveHold,
  type ComputerBoxStatus,
  type ComputerStatusStore
} from "./status-store";

export interface ComputerHandoffCardProjection {
  instruction: string;
  snapshotDataUrl?: string;
  status: ComputerHandoffResolution;
  subagentId: string | null;
}

export interface ComputerExperience {
  statusStore: ComputerStatusStore | null;
  view: ComputerStatusProjection;
  monitors: ComputerMonitor[];
  isComputerUseActive: boolean;
  isOpen: boolean;
  focusMonitorId: string | null;
  openedAtMs: number | undefined;
  openTrigger: "preview" | "handoff" | undefined;
  refresh(): void;
  open(focusMonitorId?: string | null, trigger?: "preview" | "handoff"): void;
  close(): void;
  handBack(subagentId: string | null, trigger?: "button" | "dismissed"): Promise<void>;
  cardFor(entry: TranscriptComputerHandoff): ComputerHandoffCardProjection;
  cursorFor(agentId: string | null): ComputerCursor | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function subagentRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => asRecord(row) != null) : [];
}

function boxStatus(value: unknown): ComputerBoxStatus | null {
  const record = asRecord(value);
  return typeof record?.agentId === "string" ? record as ComputerBoxStatus : null;
}

function requireBoxStatusReply(value: unknown): ComputerBoxStatus | null {
  if (value == null) return null;
  const status = boxStatus(value);
  if (status == null) throw new TypeError();
  return status;
}

export function useComputerExperience(input: {
  activeAgentId: string | null;
  bridge: DesktopBridge | null;
  client: ProductionCoordinatorClient | null;
}): ComputerExperience {
  const { activeAgentId, bridge, client } = input;
  const statusStore = useMemo(() => client == null ? null : createComputerStatusStore({
    source: {
      getForeverBoxStatus: ({ id }) => client.call("getForeverBoxStatus", { id }).then(requireBoxStatusReply),
      ensureForeverBox: ({ id }) => client.call("ensureForeverBox", { id }).then(requireBoxStatusReply),
      handBackForeverBox: ({ id, trigger }) => client.call("handBackForeverBox", { id, trigger })
    }
  }), [client]);
  const statusSnapshots = useMemo(
    () => activeAgentId == null || statusStore == null ? null : statusStore.statusSnapshotsFor(activeAgentId),
    [activeAgentId, statusStore]
  );
  const subscribeStatus = useCallback(
    (listener: () => void) => statusSnapshots?.subscribe(listener) ?? EMPTY_COMPUTER_STATUS_SUBSCRIBE(),
    [statusSnapshots]
  );
  const readStatus = useCallback(
    () => statusSnapshots?.get() ?? EMPTY_COMPUTER_STATUS_SNAPSHOT,
    [statusSnapshots]
  );
  const { status, readState, isEnsureStarting } = useSyncExternalStore(subscribeStatus, readStatus, readStatus);
  const [subagents, setSubagents] = useState<Record<string, unknown>[]>([]);
  const [asyncTasks, setAsyncTasks] = useState<Record<string, unknown>[]>([]);
  const [cursors, setCursors] = useState<Record<string, ComputerCursor>>({});
  const [isOpen, setOpen] = useState(false);
  const [focusMonitorId, setFocusMonitorId] = useState<string | null>(null);
  const [openedAtMs, setOpenedAtMs] = useState<number | undefined>();
  const [openTrigger, setOpenTrigger] = useState<"preview" | "handoff" | undefined>();
  const activeGeneration = useRef(0);

  const view = useMemo(() => projectComputerStatus(status, readState, isEnsureStarting), [isEnsureStarting, readState, status]);
  const computerMonitorIds = useMemo(
    () => subagents.flatMap((row) => row.status === "running" && row.subagentType === "computerUse" && typeof row.subagentId === "string" ? [row.subagentId] : []),
    [subagents]
  );
  const subscribeComputerStatuses = useCallback(
    (listener: () => void) => statusStore?.versionSnapshots.subscribe(listener) ?? EMPTY_COMPUTER_STATUS_SUBSCRIBE(),
    [statusStore]
  );
  const readComputerStatusVersion = useCallback(
    () => statusStore?.versionSnapshots.get() ?? 0,
    [statusStore]
  );
  const computerStatusVersion = useSyncExternalStore(subscribeComputerStatuses, readComputerStatusVersion, readComputerStatusVersion);
  useEffect(() => {
    if (statusStore == null) return;
    const releases = computerMonitorIds.map((id) => statusStore.retain(id));
    return () => { for (const release of releases) release(); };
  }, [computerMonitorIds, statusStore]);
  const monitors = useMemo(() => projectComputerMonitors(subagents, (id) => statusStore?.getStatus(id)), [computerStatusVersion, statusStore, subagents]);
  const rawComputerUseActive = useMemo(
    () => isComputerUseTaskActive(asyncTasks),
    [asyncTasks]
  );
  const isComputerUseActive = useComputerActiveHold(rawComputerUseActive, activeAgentId);

  const fetchSubagents = useCallback((id: string) => {
    if (client == null) return;
    const generation = activeGeneration.current;
    void client.call("getSubagents", { id }).then((value) => {
      if (activeGeneration.current === generation) setSubagents(subagentRows(value));
    }, () => {});
  }, [client]);

  const fetchAsyncTasks = useCallback((id: string) => {
    if (client == null) return;
    const generation = activeGeneration.current;
    void client.call("getAsyncTasks", { id }).then((value) => {
      if (activeGeneration.current === generation) setAsyncTasks(subagentRows(value));
    }, () => {});
  }, [client]);

  const ensure = useCallback((id: string) => {
    void statusStore?.ensure(id);
  }, [statusStore]);

  const refresh = useCallback(() => {
    if (activeAgentId == null || statusStore == null) return;
    void statusStore.refresh(activeAgentId);
    if (statusStore.hasDemanded(activeAgentId)) void statusStore.ensure(activeAgentId);
  }, [activeAgentId, statusStore]);

  useEffect(() => {
    activeGeneration.current += 1;
    // @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5739202 (account restore reset clears forever-box state)
    if (activeAgentId == null) statusStore?.reset();
    setSubagents([]);
    setAsyncTasks([]);
    setCursors({});
    setOpen(false);
    setFocusMonitorId(null);
    setOpenedAtMs(undefined);
    setOpenTrigger(undefined);
    if (activeAgentId != null) {
      fetchSubagents(activeAgentId);
      fetchAsyncTasks(activeAgentId);
    }
  }, [activeAgentId, fetchAsyncTasks, fetchSubagents, statusStore]);

  useEffect(() => {
    if (client == null || statusStore == null) return;
    const stopForeverBox = client.subscribe("forever-box", (value) => {
      const status = boxStatus(value);
      if (status != null) statusStore.ingestForeverBox(status);
    });
    const stopDiskPressure = client.subscribe("box-disk-pressure", (value) => statusStore.ingestBoxDiskPressure(value));
    const stopComputerActions = client.subscribe("computer-action", (value) => statusStore.ingestComputerAction(value));
    let didConnect = false;
    let stopped = false;
    const connect = () => {
      if (stopped || didConnect) return;
      didConnect = true;
      statusStore.connect();
    };
    const stopTransport = client.subscribeTransport((state) => {
      if (state !== "connected") return;
      if (didConnect) statusStore.noteReconnect();
      else connect();
    });
    void client.ready.then(connect, () => {});
    const onFocus = () => statusStore.noteWindowFocus();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      stopForeverBox();
      stopDiskPressure();
      stopComputerActions();
      stopTransport();
      window.removeEventListener("focus", onFocus);
      statusStore.dispose();
    };
  }, [client, statusStore]);

  useEffect(() => {
    if (bridge == null || statusStore == null) return;
    return bridge.foreverBox.onVncUserPresence((isPresent) => statusStore.ingestVncUserPresence({ isPresent }));
  }, [bridge, statusStore]);

  useEffect(() => {
    if (statusStore == null) return;
    return statusStore.subscribeComputerActions((value) => {
      const event = asRecord(value);
      if (event == null || typeof event.agentId !== "string") return;
      const eventAgentId = event.agentId;
      setCursors((current) => {
        const next = projectComputerCursor(event, current[eventAgentId] ?? null, performance.now());
        return next == null ? current : { ...current, [eventAgentId]: next };
      });
    });
  }, [statusStore]);

  useEffect(() => {
    if (client == null) return;
    const stopSubagents = client.subscribe("subagents", (value) => {
      const event = asRecord(value);
      if (event?.parentAgentId === activeAgentId) setSubagents(subagentRows(event.subagents));
    });
    const stopAsyncTasks = client.subscribe("async-tasks", (value) => {
      const event = asRecord(value);
      if (event?.parentAgentId === activeAgentId) setAsyncTasks(subagentRows(event.tasks));
    });
    const stopTransport = client.subscribeTransport((state) => {
      if (state !== "connected" || activeAgentId == null) return;
      fetchSubagents(activeAgentId);
      fetchAsyncTasks(activeAgentId);
    });
    return () => { stopSubagents(); stopAsyncTasks(); stopTransport(); };
  }, [activeAgentId, client, fetchAsyncTasks, fetchSubagents]);

  const open = useCallback((monitorId: string | null = null, trigger: "preview" | "handoff" = "preview") => {
    if (activeAgentId == null) return;
    bridge?.telemetry.reportOpenComputer({ trigger, hadVncUrl: (monitors.find((monitor) => monitor.subagentId === monitorId)?.vncUrl ?? view.vncUrl) != null, monitorFocused: monitorId != null });
    const openedAt = performance.now();
    setOpenedAtMs((previous) => isOpen ? previous ?? openedAt : openedAt);
    setOpenTrigger((previous) => isOpen ? previous ?? trigger : trigger);
    setFocusMonitorId(monitorId);
    setOpen(true);
    ensure(activeAgentId);
  }, [activeAgentId, bridge, ensure, isOpen, monitors, view.vncUrl]);

  const close = useCallback(() => {
    setOpen(false);
    setOpenedAtMs(undefined);
    setOpenTrigger(undefined);
  }, []);

  const handBack = useCallback(async (subagentId: string | null, trigger: "button" | "dismissed" = "button") => {
    const id = subagentId ?? activeAgentId;
    if (id == null || statusStore == null) return;
    await statusStore.handBack(id, trigger).catch(() => {});
  }, [activeAgentId, statusStore]);

  const cardFor = useCallback((entry: TranscriptComputerHandoff): ComputerHandoffCardProjection => {
    const monitor = monitors.find((candidate) => candidate.handoff?.requestId === entry.requestId);
    const base = view.handoff?.requestId === entry.requestId ? view.handoff : null;
    const live = monitor?.handoff ?? base;
    return {
      instruction: live?.instruction ?? entry.instruction,
      ...(live?.snapshotDataUrl == null ? {} : { snapshotDataUrl: live.snapshotDataUrl }),
      status: live == null ? entry.resolution ?? "handed_back" : "waiting",
      subagentId: monitor?.subagentId ?? null
    };
  }, [monitors, view.handoff]);

  const cursorFor = useCallback((agentId: string | null) => {
    const id = agentId ?? activeAgentId;
    return id == null ? null : cursors[id] ?? null;
  }, [activeAgentId, cursors]);

  return { statusStore, view, monitors, isComputerUseActive, isOpen, focusMonitorId, openedAtMs, openTrigger, refresh, open, close, handBack, cardFor, cursorFor };
}
