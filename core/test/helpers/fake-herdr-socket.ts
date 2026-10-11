import { createServer, type Server, type Socket } from "node:net";
import { unlinkSync } from "node:fs";

export interface FakeHerdrSocket {
  readonly path: string;
  readonly subscriptions: Record<string, unknown>[][];
  /** Pane ids that a subscribe request should be rejected for, with a `pane_not_found` error. Mutate freely between attempts. */
  readonly missingPanes: Set<string>;
  /** When true, accepted connections never receive a handshake ack (used to exercise handshake timeouts). */
  holdHandshake: boolean;
  push(event: string, data: Record<string, unknown>): void;
  /** Destroys every currently connected client socket without closing the server, simulating a mid-session drop. */
  dropClients(): void;
  close(): Promise<void>;
}

export function startFakeHerdrSocket(path: string): Promise<FakeHerdrSocket> {
  const subscriptions: Record<string, unknown>[][] = [];
  const missingPanes = new Set<string>();
  const clients = new Set<Socket>();
  const state = { holdHandshake: false };
  const server: Server = createServer((socket) => {
    let buffer = "";
    // A client-side resubscribe (status-mirror replacing a global-only subscription with a pane-scoped
    // one, say) destroys this socket from the other end. The server's 'close' event -- which is what
    // removes it from `clients` -- fires asynchronously, so a push() racing that teardown can still see
    // this socket in `clients` and try to write to an already-gone pipe. Without this listener, that
    // write's EPIPE is an uncaught 'error' event and kills the test process instead of the line below.
    socket.on("error", () => undefined);
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const request = JSON.parse(line) as { id: string; method: string; params: { subscriptions: Record<string, unknown>[] } };
        if (request.method === "events.subscribe") {
          subscriptions.push(request.params.subscriptions);
          if (state.holdHandshake) {
            // deliberately never ack; the client's handshake timeout should fire.
          } else {
            const rejectedPane = request.params.subscriptions.find((s) => typeof s.pane_id === "string" && missingPanes.has(s.pane_id as string));
            if (rejectedPane != null) {
              socket.write(`${JSON.stringify({ id: request.id, error: { code: "pane_not_found", message: `pane ${rejectedPane.pane_id as string} not found` } })}\n`);
            } else {
              clients.add(socket);
              socket.write(`${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`);
            }
          }
        } else {
          socket.write(`${JSON.stringify({ id: request.id, error: { code: "unknown_method", message: request.method } })}\n`);
        }
        newline = buffer.indexOf("\n");
      }
    });
    socket.on("close", () => clients.delete(socket));
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(path, () => resolve({
      path,
      subscriptions,
      missingPanes,
      get holdHandshake() { return state.holdHandshake; },
      set holdHandshake(value: boolean) { state.holdHandshake = value; },
      push: (event, data) => {
        for (const client of clients) {
          if (client.destroyed || !client.writable) continue; // torn down but not yet pruned by 'close'
          client.write(`${JSON.stringify({ event, data })}\n`);
        }
      },
      dropClients: () => { for (const client of [...clients]) client.destroy(); },
      close: () => new Promise((done) => { for (const client of clients) client.destroy(); server.close(() => { try { unlinkSync(path); } catch { /* gone */ } done(); }); }),
    }));
  });
}
