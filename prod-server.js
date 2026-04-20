/**
 * Production server for standalone Next.js + WebSocket terminal (PTY).
 */

const http = require("http");
const path = require("path");
const { parse } = require("url");
const crypto = require("crypto");

const dir = path.join(__dirname);
process.env.NODE_ENV = "production";
process.chdir(__dirname);

const currentPort = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";

const nextConfig = require(
  path.join(__dirname, ".next", "required-server-files.json")
).config;
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

// ─── Auth ──────────────────────────────────────────────────────────

const AUTH_PASSWORD = process.env.WEBMUX_PASSWORD || "";
const AUTH_SECRET =
  process.env.WEBMUX_SECRET || crypto.randomBytes(32).toString("hex");

function verifyToken(token) {
  if (!AUTH_PASSWORD) return true;
  const day = Math.floor(Date.now() / 86400000);
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

function getCookieValue(header, name) {
  if (!header) return null;
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? m[1] : null;
}

// ─── PTY terminal handler ──────────────────────────────────────────

function handleTerminal(ws, sessionName, windowIndex) {
  const pty = require("node-pty");
  // Use ={name} for exact match (prevents fnmatch pattern injection)
  const target =
    windowIndex !== undefined ? `=${sessionName}:${windowIndex}` : `=${sessionName}`;

  const socketArgs = process.env.TMUX_SOCKET
    ? ["-S", process.env.TMUX_SOCKET]
    : [];
  const ptyProcess = pty.spawn("tmux", [...socketArgs, "attach-session", "-t", target], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
  });

  ptyProcess.onData((data) => {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({ type: "output", data }));
    }
  });

  ptyProcess.onExit(() => {
    if (ws.readyState === 1) ws.close();
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input") ptyProcess.write(msg.data);
      else if (msg.type === "resize" && msg.cols && msg.rows)
        ptyProcess.resize(msg.cols, msg.rows);
    } catch {}
  });

  ws.on("close", () => ptyProcess.kill());
  ws.on("error", () => ptyProcess.kill());
}

// ─── Start ─────────────────────────────────────────────────────────

async function main() {
  let requestHandler = (_req, res) => {
    res.statusCode = 503;
    res.end("Starting...");
  };

  const server = http.createServer((req, res) => {
    requestHandler(req, res);
  });

  // WebSocket
  const { WebSocketServer } = require("ws");
  const wss = new WebSocketServer({ noServer: true });

  const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
  const ALLOWED_ORIGINS = new Set(
    (process.env.ALLOWED_ORIGINS || process.env.VIRTUAL_HOST || "localhost")
      .split(",").map((o) => o.trim().toLowerCase())
  );

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "", true);

    if (pathname && pathname.startsWith("/ws/terminal/")) {
      // Origin check
      const origin = request.headers.origin;
      if (origin) {
        try {
          const host = new URL(origin).hostname.toLowerCase();
          if (!ALLOWED_ORIGINS.has(host)) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
          }
        } catch {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      // Auth check
      const token = getCookieValue(request.headers.cookie, "webmux_token");
      if (AUTH_PASSWORD && (!token || !verifyToken(token))) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      // Validate session name
      const parts = pathname.replace("/ws/terminal/", "").split("/");
      const sessionName = decodeURIComponent(parts[0]);
      const windowIndex = parts[1] !== undefined ? parseInt(parts[1]) : undefined;

      if (!SAFE_NAME_RE.test(sessionName)) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        handleTerminal(ws, sessionName, windowIndex);
      });
    }
    // Don't destroy — let Next.js handle other upgrades
  });

  require("next");
  const { getRequestHandlers } = require("next/dist/server/lib/start-server");
  const handlers = await getRequestHandlers({
    dir,
    port: currentPort,
    hostname,
    isDev: false,
    server,
  });

  requestHandler = handlers.requestHandler;

  server.listen(currentPort, hostname, () => {
    console.log(`> webmux ready on http://${hostname}:${currentPort}`);

    // Auto-restore sessions from DB after server is ready
    setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:${currentPort}/api/sessions/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (data.restored?.length) {
          console.log(`> restored sessions: ${data.restored.join(", ")}`);
        }
      } catch (err) {
        console.error("> session restore failed:", err.message);
      }
    }, 2000);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
