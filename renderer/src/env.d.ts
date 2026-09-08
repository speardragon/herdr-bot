import type { Root } from "react-dom/client";
import type { CoordinatorPortBridge, DesktopBridge } from "./recovered/contracts/desktop-bridge";

declare global {
  interface Window {
    __grokDevRoot?: Root;
    desktop?: DesktopBridge;
    coordinatorPort?: CoordinatorPortBridge;
  }
}

export {};
