import type { PluginsNoticeEvent, SettingsNoticeEvent } from "../recovered/contracts/surface-notice";

export type RootSettingsNoticeEvent = SettingsNoticeEvent | PluginsNoticeEvent;

export interface SettingsNoticeController {
  getSnapshot(): RootSettingsNoticeEvent | null;
  subscribe(listener: () => void): () => void;
  publish(event: RootSettingsNoticeEvent): void;
  reset(): void;
  dispose(): void;
}

/**
 * Root-owned event storage. Expiry and dismissal stay in the shipped
 * SettingsNoticeView so the presenter retains its exact timers and copy.
 */
export function createSettingsNoticeController(): SettingsNoticeController {
  let snapshot: RootSettingsNoticeEvent | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(event) {
      if (disposed) return;
      snapshot = event;
      notify();
    },
    reset() {
      if (disposed || snapshot == null) return;
      snapshot = null;
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      snapshot = null;
      listeners.clear();
    }
  };
}
