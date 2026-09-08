import { connect, createServer, type Server, type Socket } from "node:net";
import { mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { log } from "../log.ts";
import { ndjsonSplitter } from "../herdr/socket.ts";
import { ControlError, parseControlRequest, type ControlResponse } from "./protocol.ts";

export type ControlHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export interface ControlServer {
  readonly socketPath: string;
  close(): Promise<void>;
}

function probeLiveSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function toResponse(id: string, error: unknown): ControlResponse {
  if (error instanceof ControlError) return { id, error: { code: error.code, message: error.message } };
  const message = error instanceof Error ? error.message : String(error);
  log("control", "handler crashed", message);
  return { id, error: { code: "internal", message } };
}

function serveConnection(socket: Socket, handler: ControlHandler): void {
  const write = (response: ControlResponse): void => {
    if (!socket.destroyed) socket.write(`${JSON.stringify(response)}\n`);
  };
  socket.on("data", ndjsonSplitter((line) => {
    const request = parseControlRequest(line);
    if (request == null) {
      write({ id: "?", error: { code: "invalid_params", message: "malformed request line" } });
      return;
    }
    handler(request.method, request.params).then(
      (result) => write({ id: request.id, result: result ?? null }),
      (error: unknown) => write(toResponse(request.id, error)),
    );
  }));
  socket.on("error", () => undefined);
}

export async function startControlServer(socketPath: string, handler: ControlHandler): Promise<ControlServer> {
  if (await probeLiveSocket(socketPath)) throw new ControlError("host_already_running", `another herdr-bot host owns ${socketPath}`);
  try {
    unlinkSync(socketPath);
  } catch {
    // no stale socket file
  }
  mkdirSync(dirname(socketPath), { recursive: true });
  const server: Server = createServer((socket) => serveConnection(socket, handler));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });
  return {
    socketPath,
    close: () => new Promise((resolve) => {
      server.close(() => {
        try {
          unlinkSync(socketPath);
        } catch {
          // already removed
        }
        resolve();
      });
    }),
  };
}
