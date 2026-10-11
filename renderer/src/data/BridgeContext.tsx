import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { HerdrBridge } from "./bridge.ts";

const BridgeContext = createContext<HerdrBridge | null>(null);

export function BridgeProvider({ bridge, children }: { readonly bridge: HerdrBridge; readonly children: ReactNode }) {
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

/** The raw `window.herdrBot`-shaped bridge (real or fake). Most code should prefer the higher-level
 * hooks (useChats, useTheme, ...) -- this is for the few call sites that need a desktop-only feature
 * with no store-backed hook of its own yet (e.g. `pickDirectory`, `openExternal`). */
export function useBridge(): HerdrBridge {
  const bridge = useContext(BridgeContext);
  if (bridge == null) throw new Error("useBridge() called outside <BridgeProvider>");
  return bridge;
}
