import { useCallback, useSyncExternalStore } from "react";
import { useStoreContext } from "../store/StoreProvider.tsx";
import type { AppSettings } from "../types.ts";

export interface SettingsHandle {
  readonly settings: AppSettings | null;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

/** App-wide defaults (`settings.get`/`settings.update`) -- the New Bot dialog and quick-create's
 * fallback values. An explicit `null` field clears it; an absent key leaves it unchanged
 * (see docs/app-api.md). */
export function useSettings(): SettingsHandle {
  const { store, client } = useStoreContext();
  const settings = useSyncExternalStore(store.subscribe, () => store.getState().settings);

  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = await client.call("settings.update", patch);
      store.setState({ ...store.getState(), settings: next });
      return next;
    },
    [client, store],
  );

  return { settings, update };
}
