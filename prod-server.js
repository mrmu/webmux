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

function handleTerminal(ws, sessionName) {
  const pty = require("node-pty");

  const ptyProcess = pty.spawn("tmux", ["attach-session", "-t", sessionName], {
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

  server.on("upgrade", (request, socket, head) => {
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
        handleTerminal(ws, sessionName);
      });
    } else {
      socket.destroy();
    }
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
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
