import { createSnapshotStore, type SnapshotStore } from "../../../runtime/snapshot-store";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L47838
// ui-layout slice metadata, sidebar defaults/bounds, and legacy persistence keys.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L47861
// modern and legacy layout projection semantics.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L48026
// setSidebarLayout clamp, no-op, and state-preserving update semantics.

export const UI_LAYOUT_SLICE = {
  slice: "ui-layout",
  schemaVersion: 3,
  scope: "client-persisted",
  accountSensitive: false
} as const;

export const LEGACY_UI_LAYOUT_KEYS = {
  sidebarWidth: "sand.sidebar.width",
  sidebarCollapsed: "sand.sidebar.collapsed",
  infoPaneOpen: "sand.infoPane.open",
  infoPaneWidth: "sand.infoPane.width",
  boxDesktopModalHeight: "sand.boxDesktopModal.stageHeight"
} as const;

export const SIDEBAR_LAYOUT_DEFAULTS = {
  expandedWidth: 280,
  isCollapsed: false
} as const;

export const SIDEBAR_LAYOUT_BOUNDS = {
  minExpandedWidth: 240,
  maxExpandedWidth: 400,
  collapsedWidth: 88
} as const;

export const INFO_PANE_LAYOUT_DEFAULTS = {
  isOpen: false,
  width: 320
} as const;

export const INFO_PANE_LAYOUT_BOUNDS = {
  minWidth: 280,
  maxWidth: 480
} as const;

export interface SidebarLayoutState {
  expandedWidth: number;
  isCollapsed: boolean;
}

export interface InfoPaneLayoutState {
  isOpen: boolean;
  width: number;
}

export interface UiLayoutState {
  sidebar: SidebarLayoutState;
  infoPane: InfoPaneLayoutState;
}

export const DEFAULT_UI_LAYOUT_STATE: UiLayoutState = {
  sidebar: { ...SIDEBAR_LAYOUT_DEFAULTS },
  infoPane: { ...INFO_PANE_LAYOUT_DEFAULTS }
};

export const UI_LAYOUT_PERSISTENCE_KEY = "sand.client.slice.ui-layout";

export interface UiLayoutPersistencePort {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
}

export type UiLayoutSnapshotStore<Value> = Pick<SnapshotStore<Value>, "get" | "subscribe">;

export interface UiLayoutStateStore {
  readonly sidebarLayout: UiLayoutSnapshotStore<SidebarLayoutState>;
  readonly infoPaneLayout: UiLayoutSnapshotStore<InfoPaneLayoutState>;
  restore(): Promise<void>;
  setSidebarLayout(next: SidebarLayoutState): void;
  setInfoPaneOpen(isOpen: boolean): void;
  setInfoPaneWidth(width: number): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function projectSidebarLayout(value: unknown): SidebarLayoutState {
  const sidebar = isRecord(value) ? value : {};
  return {
    expandedWidth: clamp(
      finiteNumber(sidebar.expandedWidth, SIDEBAR_LAYOUT_DEFAULTS.expandedWidth),
      SIDEBAR_LAYOUT_BOUNDS.minExpandedWidth,
      SIDEBAR_LAYOUT_BOUNDS.maxExpandedWidth
    ),
    isCollapsed: typeof sidebar.isCollapsed === "boolean" ? sidebar.isCollapsed : SIDEBAR_LAYOUT_DEFAULTS.isCollapsed
  };
}

function projectInfoPaneLayout(value: unknown): InfoPaneLayoutState {
  const infoPane = isRecord(value) ? value : {};
  return {
    isOpen: typeof infoPane.isOpen === "boolean" ? infoPane.isOpen : INFO_PANE_LAYOUT_DEFAULTS.isOpen,
    width: clamp(
      finiteNumber(infoPane.width, INFO_PANE_LAYOUT_DEFAULTS.width),
      INFO_PANE_LAYOUT_BOUNDS.minWidth,
      INFO_PANE_LAYOUT_BOUNDS.maxWidth
    )
  };
}

/** Projects the schema-3 ui-layout value without performing persistence. */
export function projectUiLayout(value: unknown): UiLayoutState | null {
  if (!isRecord(value)) return null;
  return {
    sidebar: projectSidebarLayout(value.sidebar),
    infoPane: projectInfoPaneLayout(value.infoPane)
  };
}

/** Projects the schema-1 legacy key/value shape without performing persistence. */
export function projectLegacyUiLayout(value: unknown): UiLayoutState | null {
  if (!isRecord(value)) return null;
  return {
    sidebar: {
      expandedWidth: clamp(
        finiteNumber(value.sidebarWidth, SIDEBAR_LAYOUT_DEFAULTS.expandedWidth),
        SIDEBAR_LAYOUT_BOUNDS.minExpandedWidth,
        SIDEBAR_LAYOUT_BOUNDS.maxExpandedWidth
      ),
      isCollapsed: typeof value.sidebarCollapsed === "boolean" ? value.sidebarCollapsed : SIDEBAR_LAYOUT_DEFAULTS.isCollapsed
    },
    infoPane: {
      isOpen: typeof value.infoPaneOpen === "boolean" ? value.infoPaneOpen : INFO_PANE_LAYOUT_DEFAULTS.isOpen,
      width: clamp(
        finiteNumber(value.infoPaneWidth, INFO_PANE_LAYOUT_DEFAULTS.width),
        INFO_PANE_LAYOUT_BOUNDS.minWidth,
        INFO_PANE_LAYOUT_BOUNDS.maxWidth
      )
    }
  };
}

/** Mirrors uiState.setSidebarLayout while preserving the unrelated info-pane state. */
export function applySidebarLayout(state: UiLayoutState, next: SidebarLayoutState): UiLayoutState {
  const sidebar = projectSidebarLayout(next);
  if (state.sidebar.expandedWidth === sidebar.expandedWidth && state.sidebar.isCollapsed === sidebar.isCollapsed) return state;
  return { ...state, sidebar };
}

function parseEnvelope(value: string | null): { kind: "absent" } | { kind: "corrupt" } | { kind: "envelope"; schemaVersion: number; value: unknown } {
  if (value == null) return { kind: "absent" };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || typeof parsed.schemaVersion !== "number" || !("value" in parsed)) return { kind: "corrupt" };
    return { kind: "envelope", schemaVersion: parsed.schemaVersion, value: parsed.value };
  } catch {
    return { kind: "corrupt" };
  }
}

function parseLegacyNumber(value: string | null, fallback: number): number {
  if (value == null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function projectLegacyValues(values: readonly (string | null)[]): UiLayoutState {
  return {
    sidebar: {
      expandedWidth: clamp(parseLegacyNumber(values[0], SIDEBAR_LAYOUT_DEFAULTS.expandedWidth), SIDEBAR_LAYOUT_BOUNDS.minExpandedWidth, SIDEBAR_LAYOUT_BOUNDS.maxExpandedWidth),
      isCollapsed: values[1] === "1"
    },
    infoPane: {
      isOpen: values[2] === "1",
      width: clamp(parseLegacyNumber(values[3], INFO_PANE_LAYOUT_DEFAULTS.width), INFO_PANE_LAYOUT_BOUNDS.minWidth, INFO_PANE_LAYOUT_BOUNDS.maxWidth)
    }
  };
}

function serializedLayout(value: UiLayoutState): string {
  return JSON.stringify({ schemaVersion: UI_LAYOUT_SLICE.schemaVersion, value });
}

/**
 * Recovers the ui-layout owner over the existing clientPersistence port.
 * The coordinator registry/reporting adapter is intentionally not recreated here.
 */
export function createUiLayoutStateStore(persistence: UiLayoutPersistencePort): UiLayoutStateStore {
  const sidebar = createSnapshotStore<SidebarLayoutState>({ ...SIDEBAR_LAYOUT_DEFAULTS });
  const infoPane = createSnapshotStore<InfoPaneLayoutState>({ ...INFO_PANE_LAYOUT_DEFAULTS });
  let disposed = false;
  let restoreGeneration = 0;
  let writes = Promise.resolve();

  const current = (): UiLayoutState => ({ sidebar: sidebar.get(), infoPane: infoPane.get() });
  const replace = (value: UiLayoutState): void => {
    sidebar.set(value.sidebar);
    infoPane.set(value.infoPane);
  };
  const enqueueWrite = (): void => {
    const value = current();
    writes = writes.then(() => persistence.write(UI_LAYOUT_PERSISTENCE_KEY, serializedLayout(value))).catch(() => {});
  };
  const legacyKeys = [
    LEGACY_UI_LAYOUT_KEYS.sidebarWidth,
    LEGACY_UI_LAYOUT_KEYS.sidebarCollapsed,
    LEGACY_UI_LAYOUT_KEYS.infoPaneOpen,
    LEGACY_UI_LAYOUT_KEYS.infoPaneWidth,
    LEGACY_UI_LAYOUT_KEYS.boxDesktopModalHeight
  ] as const;

  return {
    sidebarLayout: sidebar,
    infoPaneLayout: infoPane,
    async restore() {
      const generation = ++restoreGeneration;
      const isCurrent = () => !disposed && generation === restoreGeneration;
      const stored = parseEnvelope(await persistence.read(UI_LAYOUT_PERSISTENCE_KEY));
      if (!isCurrent()) return;
      if (stored.kind === "corrupt") {
        await persistence.remove(UI_LAYOUT_PERSISTENCE_KEY);
        if (isCurrent()) replace(DEFAULT_UI_LAYOUT_STATE);
        return;
      }
      if (stored.kind === "envelope") {
        if (stored.schemaVersion !== 1 && stored.schemaVersion !== 2 && stored.schemaVersion !== UI_LAYOUT_SLICE.schemaVersion) return;
        const projected = stored.schemaVersion === 1 ? projectLegacyUiLayout(stored.value) : projectUiLayout(stored.value);
        if (projected != null && isCurrent()) replace(projected);
        return;
      }
      const legacy = await Promise.all(legacyKeys.map((key) => persistence.read(key)));
      if (!isCurrent()) return;
      const projected = projectLegacyValues(legacy);
      replace(projected);
      const presentKeys = legacyKeys.filter((_, index) => legacy[index] != null);
      if (presentKeys.length === 0) return;
      await persistence.write(UI_LAYOUT_PERSISTENCE_KEY, serializedLayout(projected));
      if (!isCurrent()) return;
      for (const key of new Set(presentKeys)) await persistence.remove(key);
    },
    setSidebarLayout(next) {
      if (disposed) return;
      const before = current();
      const updated = applySidebarLayout(before, next);
      if (updated === before) return;
      replace(updated);
      enqueueWrite();
    },
    setInfoPaneOpen(isOpen) {
      if (disposed || infoPane.get().isOpen === isOpen) return;
      replace({ ...current(), infoPane: { ...infoPane.get(), isOpen } });
      enqueueWrite();
    },
    setInfoPaneWidth(width) {
      if (disposed) return;
      const nextWidth = clamp(width, INFO_PANE_LAYOUT_BOUNDS.minWidth, INFO_PANE_LAYOUT_BOUNDS.maxWidth);
      if (infoPane.get().width === nextWidth) return;
      replace({ ...current(), infoPane: { ...infoPane.get(), width: nextWidth } });
      enqueueWrite();
    },
    dispose() {
      disposed = true;
      restoreGeneration += 1;
    }
  };
}
