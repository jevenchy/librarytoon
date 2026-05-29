import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "../utils/logger.js";

let wss: WebSocketServer | null = null;

export function attachWs(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket) => {
    socket.on("error", (err) => logger.warn("ws_error", { err: String(err) }));
  });
}

export function broadcastProgress(payload: Record<string, unknown>): void {
  if (!wss) return;
  const msg = JSON.stringify({ type: "progress", ...payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}
