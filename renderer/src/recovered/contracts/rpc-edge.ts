export const EDGE_UNKNOWN_METHOD = "edge/unknown-method" as const;
export const EDGE_HANDLER_FAILED = "edge/handler-failed" as const;

export interface EdgeFailure {
  code: string;
  detail: string;
}

export type EdgeReplyEnvelope<Value> =
  | { ok: true; value: Value }
  | { ok: false; failure: EdgeFailure };

export interface EdgeTransport {
  invoke(channel: string, payload: unknown): Promise<unknown>;
  on(channel: string, listener: (payload: unknown) => void): () => void;
}

export class EdgeCallFailure extends Error {
  readonly code: string;
  readonly detail: string;

  constructor(failure: EdgeFailure) {
    super(`${failure.code}: ${failure.detail}`);
    this.name = "EdgeCallFailure";
    this.code = failure.code;
    this.detail = failure.detail;
  }
}

export function isEdgeReplyEnvelope(value: unknown): value is EdgeReplyEnvelope<unknown> {
  return typeof value === "object" && value != null && "ok" in value && typeof value.ok === "boolean";
}

export function methodChannel(edge: string, method: string): string {
  return `sand-rpc:${edge}:m:${method}`;
}

export function eventChannel(edge: string, event: string): string {
  return `sand-rpc:${edge}:e:${event}`;
}

export async function callEdgeMethod<Value>(
  transport: EdgeTransport,
  edge: string,
  method: string,
  payload: unknown
): Promise<Value> {
  let reply: unknown;
  try {
    reply = await transport.invoke(methodChannel(edge, method), payload);
  } catch (error) {
    throw new EdgeCallFailure({
      code: EDGE_UNKNOWN_METHOD,
      detail: error instanceof Error ? error.message : String(error)
    });
  }
  if (!isEdgeReplyEnvelope(reply)) {
    throw new EdgeCallFailure({ code: EDGE_HANDLER_FAILED, detail: "The edge replied outside its envelope." });
  }
  if (reply.ok) return reply.value as Value;
  throw new EdgeCallFailure(reply.failure);
}
