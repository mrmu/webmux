/**
 * WebSocket server for terminal streaming.
 * Shared between dev (server.ts) and production (prod-server.js).
 */

import { Server as HttpServer, IncomingMessage } from "http";
import { parse } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

// ─── Tmux helpers ──────────────────────────────────────────────────

async function runTmux(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", args);
    return stdout;
  } catch (err: unknown) {
    const error = err as { stderr?: string };
    if (error.stderr?.includes("no server running")) return "";
    throw err;
  }
}

async function capturePane(session: string): Promise<string> {
  return runTmux("capture-pane", "-t", session, "-p", "-S", "-32768");
}

async function sendRawKeys(session: string, keys: string): Promise<void> {
  await runTmux("send-keys", "-t", session, "-l", keys);
}

async function sendSpecialKey(session: string, key: string): Promise<void> {
  await runTmux("send-keys", "-t", session, key);
}

async function resizePane(session: string, w: number, h: number): Promise<void> {
  await runTmux("resize-window", "-t", session, "-x", String(w), "-y", String(h));
}

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
        const sessionName = pathname.replace("/ws/terminal/", "");
        handleTerminalConnection(ws, sessionName);
      });
    } else {
      socket.destroy();
    }
  });
}

function handleTerminalConnection(ws: WebSocket, sessionName: string) {
  let lastContent = "";
  let streaming = true;

  capturePane(sessionName)
    .then((content) => {
      lastContent = content;
      ws.send(JSON.stringify({ type: "output", data: content }));
    })
    .catch(() => {});

  const pollInterval = setInterval(async () => {
    if (!streaming) return;
    try {
      const content = await capturePane(sessionName);
      if (content !== lastContent) {
        lastContent = content;
        ws.send(JSON.stringify({ type: "output", data: content }));
      }
    } catch {
      /* session may have been killed */
    }
  }, 100);

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === "input") await sendRawKeys(sessionName, data.data || "");
      else if (data.type === "resize") await resizePane(sessionName, data.cols || 80, data.rows || 24);
      else if (data.type === "special") await sendSpecialKey(sessionName, data.key || "");
    } catch {
      /* ignore */
    }
  });

  ws.on("close", () => { streaming = false; clearInterval(pollInterval); });
  ws.on("error", () => { streaming = false; clearInterval(pollInterval); });
}
