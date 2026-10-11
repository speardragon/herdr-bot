/**
 * A browser-only stand-in for `window.herdrBot` (see desktop/src/preload.cts), used by the `?demo` dev
 * harness (src/main.tsx) so every hook/component that reads `useBridge()` works unmodified outside
 * Electron. Query params let a screenshot script drive it deterministically:
 *   ?demo                 -- turn the harness on
 *   &theme=light|dark     -- initial resolved theme (default: prefers-color-scheme)
 *   &lang=en|ko           -- initial locale (default: ko, matching the real app's default)
 */
import type { HerdrBridge, ResolvedTheme, ThemePreference, UpdateStatus } from "../data/bridge.ts";
import { createFakeAppApi } from "./fake-app-api.ts";

type Listener<T> = (value: T) => void;

function makeEmitter<T>(): { emit: (value: T) => void; on: (listener: Listener<T>) => () => void } {
  const listeners = new Set<Listener<T>>();
  return {
    emit: (value) => {
      for (const listener of listeners) listener(value);
    },
    on: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function resolveSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function createFakeBridge(): HerdrBridge {
  const query = new URLSearchParams(window.location.search);

  const themeEmitter = makeEmitter<{ preference: ThemePreference; resolved: ResolvedTheme }>();
  const themeParam = query.get("theme");
  let theme: { preference: ThemePreference; resolved: ResolvedTheme } = themeParam === "dark" || themeParam === "light" ? { preference: themeParam, resolved: themeParam } : { preference: "system", resolved: resolveSystemTheme() };

  const localeEmitter = makeEmitter<string | null>();
  let locale: string | null = query.get("lang") === "en" ? "en" : query.get("lang") === "ko" ? "ko" : null;

  const windowStateEmitter = makeEmitter<{ isFullscreen: boolean; isMaximized: boolean }>();
  const zoomEmitter = makeEmitter<number>();
  const updateStatusEmitter = makeEmitter<UpdateStatus>();

  let onboardingSeen = true;
  let pinnedChatIds: string[] = [];

  return {
    api: createFakeAppApi(),
    platform: "darwin",
    isDev: true,

    theme: {
      initial: theme,
      get: async () => theme,
      set: async (preference) => {
        theme = { preference, resolved: preference === "system" ? resolveSystemTheme() : preference };
        themeEmitter.emit(theme);
        return theme;
      },
      onChanged: themeEmitter.on,
    },
    locale: {
      initial: null,
      get: async () => locale,
      set: async (next) => {
        locale = next;
        localeEmitter.emit(locale);
        return locale;
      },
      onChanged: localeEmitter.on,
    },

    window: {
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
      getState: async () => ({ isFullscreen: false, isMaximized: false }),
      resizeWidth: async (deltaWidth) => 1040 + deltaWidth,
      onStateChanged: windowStateEmitter.on,
      getZoomFactor: () => 1,
      onZoomChanged: zoomEmitter.on,
    },

    openExternal: async (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    pickDirectory: async () => null,
    pickAvatarFile: async () => null,

    attachments: {
      stage: async (filename) => ({ ok: true, path: `demo-staged/${filename}` }),
      commit: async (paths) => [...paths],
      discard: async () => {},
      resolveMedia: async () => null,
      readText: async () => null,
      readBytes: async () => null,
      download: async () => false,
    },

    version: {
      get: async () => "0.0.0-demo",
      update: {
        getStatus: async () => ({ state: { type: "idle" }, currentVersion: "0.0.0-demo" }),
        check: async () => ({ state: { type: "idle" }, currentVersion: "0.0.0-demo" }),
        onStatusChanged: updateStatusEmitter.on,
      },
    },

    onboarding: {
      getSeen: async () => onboardingSeen,
      setSeen: async (seen) => {
        onboardingSeen = seen;
      },
    },
    pins: {
      get: async () => pinnedChatIds,
      set: async (chatIds) => {
        pinnedChatIds = [...chatIds];
        return pinnedChatIds;
      },
    },
  };
}
