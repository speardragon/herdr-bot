import { connect } from "node:net";

export interface HerdrEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

export interface HerdrSubscriptionHandlers {
  readonly onEvent: (event: HerdrEvent) => void;
  readonly onReady?: () => void;
  readonly onClose: (error: Error | null) => void;
}

export interface HerdrSubscription {
  close(): void;
}

export function ndjsonSplitter(onLine: (line: string) => void): (chunk: Buffer | string) => void {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) onLine(line);
      newline = buffer.indexOf("\n");
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One connection = one events.subscribe; nothing else is ever written on it. */
export function subscribeHerdrEvents(socketPath: string, subscriptions: readonly Record<string, unknown>[], handlers: HerdrSubscriptionHandlers): HerdrSubscription {
  const socket = connect(socketPath);
  let ready = false;
  let closedByUs = false;
  let lastError: Error | null = null;

  socket.on("connect", () => {
    socket.write(`${JSON.stringify({ id: "hb-sub", method: "events.subscribe", params: { subscriptions } })}\n`);
  });
  socket.on("data", ndjsonSplitter((line) => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (!ready) {
      const result = isRecord(message.result) ? message.result : null;
      if (result?.type === "subscription_started") {
        ready = true;
        handlers.onReady?.();
      } else {
        closedByUs = true;
        socket.destroy();
        const error = isRecord(message.error) ? message.error : {};
        handlers.onClose(new Error(typeof error.message === "string" ? error.message : "subscription refused"));
      }
      return;
    }
    if (typeof message.event === "string") handlers.onEvent({ event: message.event, data: isRecord(message.data) ? message.data : {} });
  }));
  socket.on("error", (error) => {
    lastError = error;
  });
  socket.on("close", () => {
    if (!closedByUs) handlers.onClose(lastError);
  });

  return {
    close() {
      closedByUs = true;
      socket.destroy();
    },
  };
}
