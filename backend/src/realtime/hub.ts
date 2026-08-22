import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

// Realtime event names from spec section 15:
// connection.status, log.created, log.communication.updated,
// log.file.updated, system.alert
export type RealtimeEvent =
  | { type: "connection.status"; payload: unknown }
  | { type: "log.created"; payload: unknown }
  | { type: "log.communication.updated"; payload: unknown }
  | { type: "log.file.updated"; payload: unknown }
  | { type: "system.alert"; payload: unknown };

export class RealtimeHub {
  private clients = new Set<WebSocket>();

  attach(server: HttpServer) {
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (socket) => {
      this.clients.add(socket);
      socket.on("close", () => this.clients.delete(socket));
    });
  }

  broadcast(event: RealtimeEvent) {
    const data = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) client.send(data);
    }
  }
}

export const realtimeHub = new RealtimeHub();
