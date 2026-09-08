export const MIN_WINDOW_SIZE = { width: 512, height: 520 } as const;
export const DEFAULT_WINDOW_SIZE = { width: 1200, height: 800 } as const;
export const WINDOW_BACKGROUND = "#121411";
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
