import { connect } from "node:net";
import { ndjsonSplitter } from "../herdr/socket.ts";
import { ControlError, parseControlResponse } from "./protocol.ts";

let requestCounter = 0;

/** One-shot request over the host control socket: connect → request → reply → close. */
export function controlRequest(socketPath: string, method: string, params: Record<string, unknown>, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `c${++requestCounter}`;
    const socket = connect(socketPath);
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new ControlError("timeout", `${method}: no reply within ${timeoutMs}ms`))), timeoutMs);
    socket.on("connect", () => socket.write(`${JSON.stringify({ id, method, params })}\n`));
    socket.on("data", ndjsonSplitter((line) => {
      const response = parseControlResponse(line);
      if (response == null || response.id !== id) return;
      if ("error" in response) {
        const code = response.error.code;
        finish(() => reject(new ControlError(isKnownCode(code) ? code : "internal", response.error.message)));
      } else {
        finish(() => resolve(response.result));
      }
    }));
    socket.on("error", (error) => finish(() => reject(new ControlError("connect_failed", `${method}: ${error.message}`))));
    socket.on("close", () => finish(() => reject(new ControlError("bad_response", `${method}: connection closed before a reply`))));
  });
}

function isKnownCode(code: string): code is ControlError["code"] {
  return ["unknown_pane", "unknown_chat", "unknown_bot", "not_a_member", "over_cap", "invalid_params", "unknown_method", "herdr_error", "internal", "connect_failed", "timeout", "host_already_running", "bad_response"].includes(code);
}
