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

interface ServerState {
  phase: "awaiting-hello" | "serving" | "settled";
  readonly inFlight: Map<string, AbortController>;
  readonly port: RendererPort;
  readonly options: RendererPortServerOptions;
  resolveSettled: (settlement: RendererPortSettlement) => void;
}

function settle(state: ServerState, settlement: RendererPortSettlement): void {
  if (state.phase === "settled") return;
  state.phase = "settled";
  for (const controller of state.inFlight.values()) controller.abort();
  state.inFlight.clear();
  state.port.close();
  state.resolveSettled(settlement);
}

function breach(state: ServerState, detail: string): void {
  if (state.phase === "settled") return;
  state.port.post({ kind: "lifecycle", phase: "shutdown", reason: "protocol-error", detail });
  settle(state, { outcome: "protocol-breach", detail });
}

function reply(state: ServerState, requestId: string, outcome: CoordinatorReplyOutcome): void {
  state.port.post({ kind: "reply", requestId, outcome });
}

function dispatch(state: ServerState, requestId: string, method: string, args: unknown): void {
  const dispatchRequest = state.options.dispatchRequest;
  if (dispatchRequest == null) {
    reply(state, requestId, { status: "failed", failure: { code: COORDINATOR_UNKNOWN_METHOD, message: "no method table serves this session yet" } });
    return;
  }
  const controller = new AbortController();
  state.inFlight.set(requestId, controller);
  void dispatchRequest(method, args, controller.signal).then(
    (outcome) => {
      if (state.phase !== "serving" || state.inFlight.get(requestId) !== controller) return;
      state.inFlight.delete(requestId);
      reply(state, requestId, outcome);
    },
    () => breach(state, `request ${requestId} dispatch rejected instead of settling`),
  );
}

function handleHello(state: ServerState, frame: CoordinatorFrame): void {
  // `frame.phase === "shutdown"` here is unreachable in practice (handleFrame routes shutdown
  // frames to settle() before this is ever called); the check exists only so TS can narrow
  // `frame` down to the {phase: "hello" | "ready"} variant that has `protocolVersion`.
  if (frame.kind !== "lifecycle" || frame.phase === "shutdown") return breach(state, `${frame.kind} frame before hello`);
  if (frame.protocolVersion !== COORDINATOR_PROTOCOL_VERSION) return breach(state, `hello.protocolVersion ${frame.protocolVersion} is not the supported ${COORDINATOR_PROTOCOL_VERSION}`);
  state.phase = "serving";
  state.port.post({ kind: "lifecycle", phase: "ready", protocolVersion: COORDINATOR_PROTOCOL_VERSION });
  state.options.onServing?.();
}

function handleCancel(state: ServerState, requestId: string): void {
  const controller = state.inFlight.get(requestId);
  if (controller == null) return;
  state.inFlight.delete(requestId);
  controller.abort();
  reply(state, requestId, { status: "failed", failure: { code: COORDINATOR_CANCELLED, message: "request cancelled" } });
}

function handleFrame(state: ServerState, frame: CoordinatorFrame): void {
  if (frame.kind === "lifecycle" && frame.phase === "shutdown") return settle(state, { outcome: "shutdown-requested" });
  if (frame.kind === "reply" || frame.kind === "event") return breach(state, `client posted a server-direction ${frame.kind} frame`);
  if (frame.kind === "lifecycle" && frame.phase === "ready") return breach(state, "client posted a server-direction ready frame");
  if (state.phase === "awaiting-hello") return handleHello(state, frame);
  if (frame.kind === "lifecycle") return breach(state, "hello repeated on a live session");
  if (frame.kind === "request") {
    if (state.inFlight.has(frame.requestId)) return breach(state, `request.requestId ${frame.requestId} reused while in flight`);
    return dispatch(state, frame.requestId, frame.method, frame.args);
  }
  return handleCancel(state, frame.requestId);
}

/** Serves one renderer MessagePort: hello → ready, then requests/replies/events until shutdown. */
export function createRendererPortServer(port: RendererPort, options: RendererPortServerOptions = {}): RendererPortServer {
  const state: ServerState = { phase: "awaiting-hello", inFlight: new Map(), port, options, resolveSettled: () => undefined };
  const settled = new Promise<RendererPortSettlement>((resolve) => {
    state.resolveSettled = resolve;
  });

  return {
    handleMessage(value) {
      if (state.phase === "settled") return;
      const intake = parseCoordinatorFrame(value);
      if (!intake.accepted) return breach(state, intake.rejection.detail);
      handleFrame(state, intake.frame);
    },
    handlePortClosed() {
      settle(state, { outcome: "port-closed" });
    },
    postEvent(family, payload) {
      if (state.phase === "serving") port.post({ kind: "event", family, payload });
    },
    settled,
  };
}
