// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L137985-L138027 bytes 5,760,156-5,761,292

import type {
  CoordinatorPortBridge,
  TransferredCoordinatorPort
} from "../contracts/desktop-bridge";
import {
  createPrePortCoordinatorSource,
  createRawPortCoordinatorSession,
  createStableCoordinatorSource,
  type RawPortCoordinatorSession,
  type RawPortCoordinatorSource
} from "./coordinator-source";

type IdentityState =
  | { readonly kind: "idle" }
  | { readonly kind: "restoring"; readonly port: TransferredCoordinatorPort | null }
  | { readonly kind: "failed" };

export interface CoordinatorSourceClaimant {
  readonly source: RawPortCoordinatorSource;
  beginIdentityChange(): void;
  failIdentityChange(): void;
  completeIdentityChange(options: { readonly acceptPort: boolean }): void;
  activeRoute(): "pending" | "coordinator";
  dispose(): void;
}

export function createCoordinatorSourceClaimant(
  portBridge: CoordinatorPortBridge
): CoordinatorSourceClaimant {
  let prePort = createPrePortCoordinatorSource();
  const stable = createStableCoordinatorSource(prePort.source);
  let active: RawPortCoordinatorSession | null = null;
  let identity: IdentityState = { kind: "idle" };
  let disposed = false;

  const adopt = (port: TransferredCoordinatorPort): void => {
    active?.dispose();
    const session = createRawPortCoordinatorSession({
      post: (frame) => port.postMessage(frame),
      close: () => port.close()
    });
    port.addEventListener("message", (event) => session.handleMessage(event.data));
    port.addEventListener("close", () => session.handlePortClosed());
    port.start?.();
    active = session;
    stable.swap(session.source);
    prePort.settle();
  };

  const onPort = (port: TransferredCoordinatorPort): void => {
    if (disposed) {
      port.close();
      return;
    }
    if (identity.kind === "failed") {
      port.close();
      return;
    }
    if (identity.kind === "restoring") {
      identity.port?.close();
      identity = { kind: "restoring", port };
      return;
    }
    adopt(port);
  };

  const claim = portBridge.claim({ onPort });
  claim?.request();

  return {
    source: stable.source,
    beginIdentityChange() {
      if (disposed) return;
      if (identity.kind === "restoring") identity.port?.close();
      identity = { kind: "restoring", port: null };
      prePort.settle();
      prePort = createPrePortCoordinatorSource();
      stable.suspend(prePort.source);
      active?.dispose();
      active = null;
    },
    failIdentityChange() {
      if (disposed || identity.kind !== "restoring") return;
      identity.port?.close();
      identity = { kind: "failed" };
      prePort.settle();
    },
    completeIdentityChange({ acceptPort }) {
      if (disposed || identity.kind !== "restoring") return;
      const { port } = identity;
      identity = { kind: "idle" };
      if (port === null) {
        if (acceptPort) claim?.request();
        return;
      }
      if (acceptPort) {
        adopt(port);
        return;
      }
      port.close();
    },
    activeRoute: () => active === null ? "pending" : "coordinator",
    dispose() {
      if (disposed) return;
      disposed = true;
      claim?.release();
      active?.dispose();
      if (identity.kind === "restoring") identity.port?.close();
      identity = { kind: "failed" };
      prePort.settle();
    }
  };
}
