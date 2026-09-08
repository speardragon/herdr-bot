import { COORDINATOR_CANCELLED, COORDINATOR_PROTOCOL_VERSION, COORDINATOR_UNKNOWN_METHOD, parseCoordinatorFrame, type CoordinatorFrame, type CoordinatorReplyOutcome } from "./frames.ts";

export interface RendererPort {
  post(frame: CoordinatorFrame): void;
  close(): void;
}

export type RendererPortSettlement =
  | { readonly outcome: "shutdown-requested" | "port-closed" }
  | { readonly outcome: "protocol-breach"; readonly detail: string };

export interface RendererPortServerOptions {
  readonly dispatchRequest?: (method: string, args: unknown, signal: AbortSignal) => Promise<CoordinatorReplyOutcome>;
  readonly onServing?: () => void;
}

export interface RendererPortServer {
  handleMessage(value: unknown): void;
  handlePortClosed(): void;
  postEvent(family: string, payload: unknown): void;
  readonly settled: Promise<RendererPortSettlement>;
}

/** Serves one renderer MessagePort: hello → ready, then requests/replies/events until shutdown. */
export function createRendererPortServer(port: RendererPort, options: RendererPortServerOptions = {}): RendererPortServer {
  let phase: "awaiting-hello" | "serving" | "settled" = "awaiting-hello";
  const inFlight = new Map<string, AbortController>();
  let resolveSettled: (settlement: RendererPortSettlement) => void = () => undefined;
  const settled = new Promise<RendererPortSettlement>((resolve) => {
    resolveSettled = resolve;
  });

  const settle = (settlement: RendererPortSettlement): void => {
    if (phase === "settled") return;
    phase = "settled";
    for (const controller of inFlight.values()) controller.abort();
    inFlight.clear();
    port.close();
    resolveSettled(settlement);
  };
  const breach = (detail: string): void => {
    if (phase === "settled") return;
    port.post({ kind: "lifecycle", phase: "shutdown", reason: "protocol-error", detail });
    settle({ outcome: "protocol-breach", detail });
  };
  const reply = (requestId: string, outcome: CoordinatorReplyOutcome): void => port.post({ kind: "reply", requestId, outcome });

  const dispatch = (requestId: string, method: string, args: unknown): void => {
    const dispatchRequest = options.dispatchRequest;
    if (dispatchRequest == null) {
      reply(requestId, { status: "failed", failure: { code: COORDINATOR_UNKNOWN_METHOD, message: "no method table serves this session yet" } });
      return;
    }
    const controller = new AbortController();
    inFlight.set(requestId, controller);
    void dispatchRequest(method, args, controller.signal).then(
      (outcome) => {
        if (phase !== "serving" || inFlight.get(requestId) !== controller) return;
        inFlight.delete(requestId);
        reply(requestId, outcome);
      },
      () => breach(`request ${requestId} dispatch rejected instead of settling`),
    );
  };

  const handleFrame = (frame: CoordinatorFrame): void => {
    if (frame.kind === "lifecycle" && frame.phase === "shutdown") return settle({ outcome: "shutdown-requested" });
    if (frame.kind === "reply" || frame.kind === "event") return breach(`client posted a server-direction ${frame.kind} frame`);
    if (frame.kind === "lifecycle" && frame.phase === "ready") return breach("client posted a server-direction ready frame");
    if (phase === "awaiting-hello") {
      if (frame.kind !== "lifecycle") return breach(`${frame.kind} frame before hello`);
      if (frame.protocolVersion !== COORDINATOR_PROTOCOL_VERSION) return breach(`hello.protocolVersion ${frame.protocolVersion} is not the supported ${COORDINATOR_PROTOCOL_VERSION}`);
      phase = "serving";
      port.post({ kind: "lifecycle", phase: "ready", protocolVersion: COORDINATOR_PROTOCOL_VERSION });
      options.onServing?.();
      return;
    }
    if (frame.kind === "lifecycle") return breach("hello repeated on a live session");
    if (frame.kind === "request") {
      if (inFlight.has(frame.requestId)) return breach(`request.requestId ${frame.requestId} reused while in flight`);
      return dispatch(frame.requestId, frame.method, frame.args);
    }
    const controller = inFlight.get(frame.requestId);
    if (controller == null) return;
    inFlight.delete(frame.requestId);
    controller.abort();
    reply(frame.requestId, { status: "failed", failure: { code: COORDINATOR_CANCELLED, message: "request cancelled" } });
  };

  return {
    handleMessage(value) {
      if (phase === "settled") return;
      const intake = parseCoordinatorFrame(value);
      if (!intake.accepted) return breach(intake.rejection.detail);
      handleFrame(intake.frame);
    },
    handlePortClosed() {
      settle({ outcome: "port-closed" });
    },
    postEvent(family, payload) {
      if (phase === "serving") port.post({ kind: "event", family, payload });
    },
    settled,
  };
}
