/**
 * Standalone terminal WebSocket server for development.
 * Runs alongside `next dev` on a separate port.
 *
 * Usage: npx tsx ws-dev-server.ts
 */

import { createServer } from "http";
import { setupWebSocket } from "./ws-server";

const port = parseInt(process.env.WS_PORT || "3001", 10);

const server = createServer((_req, res) => {
  res.writeHead(200);
  res.end("WebSocket terminal server");
});

setupWebSocket(server);

server.listen(port, () => {
  console.log(`> terminal WebSocket server on ws://localhost:${port}`);
});
