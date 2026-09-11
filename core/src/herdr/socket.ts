import { connect } from "node:net";
import { HerdrError } from "./types.ts";

export interface HerdrEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

export interface HerdrSubscriptionHandlers {
  readonly onEvent: (event: HerdrEvent) => void;
  readonly onReady?: () => void;
  readonly onClose: (error: Error | null) => void;
}

export interface HerdrSubscriptionOptions {
  readonly handshakeTimeoutMs?: number;
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
export function subscribeHerdrEvents(socketPath: string, subscriptions: readonly Record<string, unknown>[], handlers: HerdrSubscriptionHandlers, options: HerdrSubscriptionOptions = {}): HerdrSubscription {
  const socket = connect(socketPath);
  let ready = false;
  let notified = false;
  let lastError: Error | null = null;

  const handshakeTimer = setTimeout(() => {
    finish(new HerdrError("handshake_timeout", "herdr subscription handshake timed out"));
  }, options.handshakeTimeoutMs ?? 5_000);
  handshakeTimer.unref();

  function clearHandshakeTimer(): void {
    clearTimeout(handshakeTimer);
  }

  function finish(error: Error | null): void {
    clearHandshakeTimer();
    if (notified) return;
    notified = true;
    socket.destroy();
    handlers.onClose(error);
  }

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
        clearHandshakeTimer();
        handlers.onReady?.();
      } else {
        const error = isRecord(message.error) ? message.error : {};
        const code = typeof error.code === "string" ? error.code : "herdr_error";
        const errorMessage = typeof error.message === "string" ? error.message : "subscription refused";
        finish(new HerdrError(code, errorMessage));
      }
      return;
    }
    if (typeof message.event === "string") handlers.onEvent({ event: message.event, data: isRecord(message.data) ? message.data : {} });
  }));
  socket.on("error", (error) => {
    lastError = error;
  });
  socket.on("close", () => {
    finish(lastError);
  });

  return {
    close() {
      finish(null);
    },
  };
}
