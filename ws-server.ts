/**
 * WebSocket server for terminal streaming via PTY.
 *
 * Instead of polling tmux capture-pane, we spawn `tmux attach-session`
 * through a real PTY. This gives proper ANSI output for xterm.js.
 */

import { Server as HttpServer, IncomingMessage } from "http";
import { parse } from "url";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import crypto from "crypto";

// ─── Auth ──────────────────────────────────────────────────────────

const AUTH_PASSWORD = process.env.WEBMUX_PASSWORD || "";
const AUTH_SECRET =
  process.env.WEBMUX_SECRET || crypto.randomBytes(32).toString("hex");

function verifyToken(token: string): boolean {
  if (!AUTH_PASSWORD) return true;
  const day = Math.floor(Date.now() / 86_400_000);
  for (const offset of [0, 1]) {
    const expected = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(String(day - offset))
      .digest("hex");
    try {
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)))
        return true;
    } catch {
      continue;
    }
  }
  return false;
}

function getCookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

// ─── WebSocket setup ───────────────────────────────────────────────

export function setupWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const { pathname } = parse(request.url || "", true);

    if (pathname && pathname.startsWith("/ws/terminal/")) {
      const token = getCookieValue(request.headers.cookie, "webmux_token");
      if (AUTH_PASSWORD && (!token || !verifyToken(token))) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        // URL: /ws/terminal/{session} or /ws/terminal/{session}/{windowIndex}
        const parts = pathname.replace("/ws/terminal/", "").split("/");
        const sessionName = parts[0];
        const windowIndex = parts[1] !== undefined ? parseInt(parts[1]) : undefined;
        handleTerminalConnection(ws, sessionName, windowIndex);
      });
    }
    // Don't destroy other upgrades — let Next.js handle HMR WebSocket
  });
}

function handleTerminalConnection(ws: WebSocket, sessionName: string, windowIndex?: number) {
  // Target: session:window if specified, otherwise just session
  const target =
    windowIndex !== undefined ? `${sessionName}:${windowIndex}` : sessionName;

  // Spawn tmux attach through a real PTY, targeting specific window
  const socketArgs = process.env.TMUX_SOCKET
    ? ["-S", process.env.TMUX_SOCKET]
    : [];
  const ptyProcess = pty.spawn(
    "tmux",
    [...socketArgs, "attach-session", "-t", target],
    {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  });

  // PTY output → WebSocket → xterm.js
  ptyProcess.onData((data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "output", data }));
    }
  });

  ptyProcess.onExit(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  // WebSocket → PTY
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input") {
        ptyProcess.write(msg.data);
      } else if (msg.type === "resize" && msg.cols && msg.rows) {
        ptyProcess.resize(msg.cols, msg.rows);
      }
    } catch {
      /* ignore malformed */
    }
  });

  ws.on("close", () => {
    ptyProcess.kill();
  });

  ws.on("error", () => {
    ptyProcess.kill();
  });
}
