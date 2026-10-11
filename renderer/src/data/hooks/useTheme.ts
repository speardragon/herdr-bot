import { useCallback, useEffect, useState } from "react";
import { useBridge } from "../BridgeContext.tsx";
import type { ResolvedTheme, ThemePreference } from "../bridge.ts";

export type { ResolvedTheme, ThemePreference } from "../bridge.ts";

export interface ThemeHandle {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
}

/** Applies the resolved theme to `<html data-theme>` -- the one place styles/tokens.css's dark-theme
 * overrides key off. Exported so `main.tsx` can call it synchronously before the first paint (using
 * `window.herdrBot.theme.initial`), avoiding the flash a first effect-driven paint would cause. */
export function applyThemeAttribute(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
}

/** Settings dialog's Appearance control only offers Light/Dark (the host's `"system"`
 * preference value is deliberately not exposed in this UI), but the hook still tracks whatever
 * preference is persisted so a future "System" option is a one-line addition, not a new code path. */
export function useTheme(): ThemeHandle {
  const bridge = useBridge();
  const [state, setState] = useState(() => bridge.theme.initial);

  useEffect(() => {
    applyThemeAttribute(state.resolved);
  }, [state.resolved]);

  useEffect(() => bridge.theme.onChanged((next) => setState(next)), [bridge]);

  const setPreference = useCallback(
    (preference: ThemePreference) => {
      void bridge.theme.set(preference).then((next) => setState(next));
    },
    [bridge],
  );

  return { preference: state.preference, resolved: state.resolved, setPreference };
}
