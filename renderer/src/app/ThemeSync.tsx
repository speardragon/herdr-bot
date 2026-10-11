import { useTheme } from "../data/hooks/useTheme.ts";

/**
 * Keeps `<html data-theme>` in sync with `window.herdrBot.theme` for the whole app lifetime (OS theme
 * flips while `preference: "system"`, or a future Settings dialog calling `setPreference`). Renders
 * nothing -- `main.tsx` already sets the attribute once synchronously before first paint; this is what
 * keeps it correct afterward. Mounted once in `App.tsx`, inside `BridgeProvider` (needs `useBridge`).
 */
export function ThemeSync() {
  useTheme();
  return null;
}
