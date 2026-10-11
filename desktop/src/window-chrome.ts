export const MIN_WINDOW_SIZE = { width: 512, height: 520 } as const;
export const DEFAULT_WINDOW_SIZE = { width: 1040, height: 760 } as const;
export const WINDOW_BACKGROUND = "#121411";
export const LIGHT_WINDOW_BACKGROUND = "#fcfcfc";
export const MAC_TRAFFIC_LIGHT_POSITION = { x: 16, y: 15 } as const;
export const WINDOWS_TITLE_BAR_OVERLAY_HEIGHT_PX = 51;

export type BrowserWindowChrome =
  | { readonly frame: true; readonly titleBarStyle: "hiddenInset"; readonly trafficLightPosition: { readonly x: number; readonly y: number } }
  | { readonly frame: false; readonly titleBarStyle: "hidden"; readonly titleBarOverlay: { readonly height: number; readonly color: string; readonly symbolColor: string } }
  | { readonly frame: false; readonly titleBarStyle: "default" };

export function windowChromeOptions(platform: NodeJS.Platform): BrowserWindowChrome {
  if (platform === "darwin") return { frame: true, titleBarStyle: "hiddenInset", trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION };
  if (platform === "win32") return { frame: false, titleBarStyle: "hidden", titleBarOverlay: { height: WINDOWS_TITLE_BAR_OVERLAY_HEIGHT_PX, color: WINDOW_BACKGROUND, symbolColor: "#FFFFFF" } };
  return { frame: false, titleBarStyle: "default" };
}

/** First-frame window colour: match the theme so a light window does not flash dark before the renderer paints. */
export function windowBackground(isDark: boolean): string {
  return isDark ? WINDOW_BACKGROUND : LIGHT_WINDOW_BACKGROUND;
}

/** macOS convention: closing the window hides it (dock icon and process -- host + the 5 s herdr
 * polling -- stay alive) rather than quitting, unless the app itself is already quitting (Cmd+Q, the
 * "Quit" menu item, or app.quit()); otherwise the close event would be swallowed forever and the app
 * could never actually exit. Every other platform's window close behaves as before. */
export function shouldHideInsteadOfClose(platform: NodeJS.Platform, isQuitting: boolean): boolean {
  return platform === "darwin" && !isQuitting;
}

/** Non-mac platforms quit once every window is closed; mac keeps the process alive so `activate`
 * (clicking the Dock icon) can reopen the hidden window instead of relying on window-all-closed. */
export function shouldQuitOnWindowAllClosed(platform: NodeJS.Platform): boolean {
  return platform !== "darwin";
}
