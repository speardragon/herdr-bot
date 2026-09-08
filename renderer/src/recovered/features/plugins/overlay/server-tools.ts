import type { McpToolSummary } from "../../../contracts/desktop-bridge";

// Immutable renderer root: e589e76cbca36272ee2d83edf0b7124f929bda9e4b22cf3dcb96f75b39ecda5f
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L918 (tool card)
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L953 (optimistic toggle)
// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#L971 (toggle bridge)

export type PluginServerToolsSnapshot = {
  status: "loading" | "ready" | "failed";
  tools: readonly McpToolSummary[];
  failure: unknown | null;
  pendingTool: string | null;
};

export interface PluginServerToolsController {
  getSnapshot(): PluginServerToolsSnapshot;
  subscribe(listener: () => void): () => void;
  open(): void;
  retry(): Promise<void>;
  toggle(toolName: string): Promise<void>;
  dispose(): void;
}

export function togglePluginServerToolOptimistically(tools: readonly McpToolSummary[], toolName: string): McpToolSummary[] {
  return tools.map((tool) => tool.name === toolName ? { ...tool, isDisabled: !tool.isDisabled } : { ...tool });
}

export function createPluginServerToolsController(
  load: () => Promise<readonly McpToolSummary[]>,
  toggle: (toolName: string) => Promise<readonly McpToolSummary[]>,
): PluginServerToolsController {
  const listeners = new Set<() => void>();
  let snapshot: PluginServerToolsSnapshot = { status: "loading", tools: [], failure: null, pendingTool: null };
  let generation = 0;
  let request = 0;
  let opened = false;
  let disposed = false;

  const publish = (next: PluginServerToolsSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const isCurrent = (runGeneration: number) => !disposed && opened && runGeneration === generation;

  const refresh = async (): Promise<void> => {
    if (disposed || !opened) return;
    const runGeneration = generation;
    const runRequest = ++request;
    publish({ ...snapshot, status: "loading", failure: null });
    try {
      const tools = await load();
      if (!isCurrent(runGeneration) || runRequest !== request) return;
      publish({ status: "ready", tools: tools.map((tool) => ({ ...tool })), failure: null, pendingTool: snapshot.pendingTool });
    } catch (failure: unknown) {
      if (isCurrent(runGeneration) && runRequest === request) publish({ ...snapshot, status: "failed", failure });
      throw failure;
    }
  };

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open() {
      if (disposed || opened) return;
      opened = true;
      generation += 1;
      void refresh().catch(() => {});
    },
    retry: refresh,
    async toggle(toolName) {
      if (disposed || !opened || snapshot.pendingTool != null) return;
      const runGeneration = generation;
      const previous = snapshot.tools;
      publish({ ...snapshot, status: "ready", failure: null, tools: togglePluginServerToolOptimistically(previous, toolName), pendingTool: toolName });
      try {
        const tools = await toggle(toolName);
        if (isCurrent(runGeneration)) publish({ status: "ready", tools: tools.map((tool) => ({ ...tool })), failure: null, pendingTool: null });
      } catch (failure: unknown) {
        // The shipped Ci/ht path retains its optimistic projection and exposes
        // the failure; it does not roll back the toggle locally.
        if (isCurrent(runGeneration)) publish({ ...snapshot, status: "ready", failure, pendingTool: null });
        throw failure;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      opened = false;
      generation += 1;
      request += 1;
      listeners.clear();
    },
  };
}
