import { createServer, type Server, type Socket } from "node:net";
import { unlinkSync } from "node:fs";

export interface FakeHerdrSocket {
  readonly path: string;
  readonly subscriptions: Record<string, unknown>[][];
  push(event: string, data: Record<string, unknown>): void;
  close(): Promise<void>;
}

export function startFakeHerdrSocket(path: string): Promise<FakeHerdrSocket> {
  const subscriptions: Record<string, unknown>[][] = [];
  const clients = new Set<Socket>();
  const server: Server = createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const request = JSON.parse(line) as { id: string; method: string; params: { subscriptions: Record<string, unknown>[] } };
        if (request.method === "events.subscribe") {
          subscriptions.push(request.params.subscriptions);
          clients.add(socket);
          socket.write(`${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`);
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
      push: (event, data) => { for (const client of clients) client.write(`${JSON.stringify({ event, data })}\n`); },
      close: () => new Promise((done) => { for (const client of clients) client.destroy(); server.close(() => { try { unlinkSync(path); } catch { /* gone */ } done(); }); }),
    }));
  });
}
