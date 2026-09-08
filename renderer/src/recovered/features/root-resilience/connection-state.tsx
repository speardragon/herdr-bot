import { useSyncExternalStore } from "react";
import { RosterReconnectNotice } from "../roster/reconnect-notice";
import { RosterStatus } from "../roster/status";
import type { CoordinatorConnectionController } from "./connection-state";

// Keep the same-stem controller/view handoff consumable by both TypeScript's
// bundler resolver and esbuild's runtime resolver.
export { createCoordinatorConnectionController, createCoordinatorConnectionSource } from "./connection-state.js";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2553043 (reconnect host)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2550111 (unreachable roster state)
// The host projects the shipped RosterStatus surface, including its
// sand-agents-state DOM signature; it does not introduce a new status style.

const readSnapshot = (controller: CoordinatorConnectionController) => controller.get();

export interface CoordinatorConnectionHostProps {
  readonly controller: CoordinatorConnectionController;
}

/**
 * Root-owner handoff for the already-shipped connection surfaces. It deliberately
 * reuses the exact roster status/reconnect views; the host is not mounted here
 * while ProductionRenderer ownership is in flight.
 */
export function CoordinatorConnectionHost({ controller }: CoordinatorConnectionHostProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, () => readSnapshot(controller), () => readSnapshot(controller));
  if (snapshot.phase === "hidden" || snapshot.phase === "connected") return null;
  if (snapshot.phase === "loading") return <RosterStatus kind="loading" />;
  if (snapshot.phase === "unreachable") return <RosterStatus isRetrying={snapshot.isRetrying} kind="error" onRetry={() => void controller.retry()} />;
  return <RosterReconnectNotice isRetrying={snapshot.isRetrying} onRetry={() => void controller.retry()} />;
}

export default CoordinatorConnectionHost;
