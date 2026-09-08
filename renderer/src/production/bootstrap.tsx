import { StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CoordinatorPortBridge, DesktopBridge } from "../recovered/contracts/desktop-bridge";
import { hasDesktopBridge } from "../recovered/contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L537 bytes 5,788,077-5,793,115
export const PACKAGED_INVARIANT_MESSAGE = "Invariant violation (message stripped in packaged builds; the stack identifies the site)";

export interface ProductionRendererRuntime {
  bridge: DesktopBridge;
  coordinatorPort: CoordinatorPortBridge;
}

function invariant(condition: unknown): asserts condition {
  if (!condition) throw new Error(PACKAGED_INVARIANT_MESSAGE);
}

export function acquireProductionRendererRuntime(windowValue: unknown): ProductionRendererRuntime {
  invariant(typeof windowValue === "object" && windowValue != null);
  const candidate = windowValue as { desktop?: unknown; coordinatorPort?: unknown };
  invariant(hasDesktopBridge(candidate.desktop));
  invariant(typeof candidate.coordinatorPort === "object" && candidate.coordinatorPort != null);
  invariant(typeof (candidate.coordinatorPort as { claim?: unknown }).claim === "function");
  return { bridge: candidate.desktop, coordinatorPort: candidate.coordinatorPort as CoordinatorPortBridge };
}

export function requireProductionRendererMount(mount: HTMLElement | null): HTMLElement {
  invariant(mount != null);
  return mount;
}

export function mountProductionRenderer(mount: HTMLElement, renderer: ReactElement): Root {
  const root = createRoot(mount);
  root.render(<StrictMode>{renderer}</StrictMode>);
  return root;
}
