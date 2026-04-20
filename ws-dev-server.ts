/**
 * Standalone terminal WebSocket server for development.
 * Binds to 127.0.0.1 only (not exposed to LAN).
 */

import { createServer } from "http";
import { setupWebSocket } from "./ws-server";

const port = parseInt(process.env.WS_PORT || "3001", 10);
const host = "127.0.0.1";

if (!process.env.WEBMUX_PASSWORD) {
  console.warn("⚠ WEBMUX_PASSWORD not set — auth disabled. Binding to localhost only.");
}

const server = createServer((_req, res) => {
  res.writeHead(200);
  res.end("WebSocket terminal server");
});

setupWebSocket(server);

server.listen(port, host, () => {
  console.log(`> terminal WebSocket server on ws://${host}:${port}`);
});
