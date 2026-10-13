/**
 * The renderer's view of `window.herdrBot` (see desktop/src/preload.cts and docs/app-api.md's "Desktop
 * extras" section). Hand-declared here rather than `import type { HerdrBotBridge } from
 * "desktop/src/preload.cts"`: that file is a `.cts` (forced-CommonJS) module containing `import`/
 * `export` statements, and TypeScript applies the *consuming* program's compiler options (renderer's
 * `verbatimModuleSyntax: true`) when it has to parse a cross-project file pulled in by a type-only
 * import -- CommonJS module kind + ESM import syntax + verbatimModuleSyntax is a hard conflict with no
 * per-file override short of project references. Keep this in sync with preload.cts's `herdrBot`
 * object by hand; `src/dev/fake-bridge.ts` implements this same interface for the browser harness, so
 * drift shows up immediately as a type error there.
 */
import type { AppApiTransport } from "./types.ts";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export interface ThemeState {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
}

export interface WindowState {
  readonly isFullscreen: boolean;
  readonly isMaximized: boolean;
}

export type StageAttachmentResult = { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: "empty" | "too-large" | "failed" };

export type UpdateCheckState =
  | { readonly type: "idle"; readonly lastCheck?: { readonly at: number; readonly result: "up-to-date" | "error"; readonly errorMessage?: string } }
  | { readonly type: "available"; readonly version: string; readonly releaseUrl: string; readonly installError?: string }
  | { readonly type: "downloading"; readonly version: string; readonly releaseUrl: string; readonly progress: number }
  | { readonly type: "restarting"; readonly version: string };
export interface UpdateStatus {
  readonly state: UpdateCheckState;
  readonly currentVersion: string;
}

export interface HerdrBridge {
  readonly api: AppApiTransport;
  readonly platform: NodeJS.Platform;
  readonly isDev: boolean;
  readonly theme: {
    readonly initial: ThemeState;
    get(): Promise<ThemeState>;
    set(preference: ThemePreference): Promise<ThemeState>;
    onChanged(listener: (state: ThemeState) => void): () => void;
  };
  readonly locale: {
    readonly initial: string | null;
    get(): Promise<string | null>;
    set(locale: string | null): Promise<string | null>;
    onChanged(listener: (locale: string | null) => void): () => void;
  };
  readonly window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    getState(): Promise<WindowState>;
    onStateChanged(listener: (state: WindowState) => void): () => void;
    resizeWidth(deltaWidth: number): Promise<number>;
    getZoomFactor(): number;
    onZoomChanged(listener: (zoom: number) => void): () => void;
  };
  openExternal(url: string): Promise<void>;
  pickDirectory(defaultPath?: string): Promise<string | null>;
  pickAvatarFile(): Promise<{ readonly dataUrl: string; readonly fileName: string } | null>;
  readonly attachments: {
    stage(filename: string, bytes: Uint8Array): Promise<StageAttachmentResult>;
    commit(paths: readonly string[]): Promise<string[] | null>;
    discard(path: string): Promise<void>;
    resolveMedia(source: string): Promise<unknown>;
    readText(path: string): Promise<unknown>;
    readBytes(path: string, maxBytes: number): Promise<unknown>;
    download(path: string, suggestedName?: string): Promise<boolean>;
  };
  readonly version: {
    get(): Promise<string>;
    readonly update: {
      getStatus(): Promise<UpdateStatus>;
      check(): Promise<UpdateStatus>;
      /** Downloads and installs the available version, then restarts the app (or opens the release page when this build cannot update itself). */
      install(): Promise<UpdateStatus>;
      onStatusChanged(listener: (status: UpdateStatus) => void): () => void;
    };
  };
  readonly onboarding: {
    getSeen(): Promise<boolean>;
    setSeen(seen: boolean): Promise<void>;
  };
  readonly pins: {
    get(): Promise<string[]>;
    set(chatIds: readonly string[]): Promise<string[]>;
  };
}

declare global {
  interface Window {
    /** Present in the real Electron app (set by preload.cts); absent in the plain-browser `?demo`
     * harness, where main.tsx installs src/dev/fake-bridge.ts's equivalent instead. */
    herdrBot?: HerdrBridge;
  }
}
