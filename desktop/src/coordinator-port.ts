import type { Host } from "../../core/src/host.ts";
import { createCoordinatorDispatcher } from "../../core/src/coordinator/dispatcher.ts";
import { createRendererPortServer, type RendererPortSettlement } from "../../core/src/coordinator/port-server.ts";
import type { HostEventFamily } from "../../core/src/host-events.ts";

/** The subset of Electron's MessagePortMain this module touches (kept structural so tests can fake it). */
export interface MessagePortMainLike {
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
  on(event: "message", handler: (event: { data: unknown }) => void): unknown;
  on(event: "close", handler: () => void): unknown;
}

const FAMILIES: readonly HostEventFamily[] = ["agents", "agent-upserted", "transcript"];

export function attachRendererPort(port: MessagePortMainLike, host: Host): { settled: Promise<RendererPortSettlement>; detach(): void } {
  const dispatch = createCoordinatorDispatcher(host);
  const server = createRendererPortServer(
    { post: (frame) => port.postMessage(frame), close: () => port.close() },
    { dispatchRequest: (method, args) => dispatch(method, args) },
  );
  const unsubscribes = FAMILIES.map((family) => host.events.on(family, (payload) => server.postEvent(family, payload)));
  const detach = (): void => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
  port.on("message", (event) => server.handleMessage(event.data));
  port.on("close", () => server.handlePortClosed());
  port.start();
  void server.settled.then(detach);
  return { settled: server.settled, detach };
}
