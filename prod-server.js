/**
 * Production server for standalone Next.js + WebSocket.
 * Uses the same startServer approach as the default standalone server.js
 * but injects WebSocket handling via the httpServer instance.
 */

const path = require("path");
const { parse } = require("url");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const dir = path.join(__dirname);
process.env.NODE_ENV = "production";
process.chdir(__dirname);

const currentPort = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";

// Load config from required-server-files.json (same as default standalone)
const nextConfig = require(
  path.join(__dirname, ".next", "required-server-files.json")
).config;

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

// ─── Tmux helpers ──────────────────────────────────────────────────

async function runTmux(...args) {
  try {
    const { stdout } = await execFileAsync("tmux", args);
    return stdout;
  } catch (err) {
    if (err.stderr && err.stderr.includes("no server running")) return "";
    throw err;
  }
}

const capturePane = (s) =>
  runTmux("capture-pane", "-t", s, "-p", "-S", "-32768");
const sendRawKeys = (s, k) => runTmux("send-keys", "-t", s, "-l", k);
const sendSpecialKey = (s, k) => runTmux("send-keys", "-t", s, k);
const resizePane = (s, w, h) =>
  runTmux("resize-window", "-t", s, "-x", String(w), "-y", String(h));

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

// ─── WebSocket terminal handler ────────────────────────────────────

function handleTerminal(ws, sessionName) {
  let lastContent = "";
  let streaming = true;

  capturePane(sessionName)
    .then((content) => {
      lastContent = content;
      ws.send(JSON.stringify({ type: "output", data: content }));
    })
    .catch(() => {});

  const poll = setInterval(async () => {
    if (!streaming) return;
    try {
      const content = await capturePane(sessionName);
      if (content !== lastContent) {
        lastContent = content;
        ws.send(JSON.stringify({ type: "output", data: content }));
      }
    } catch {}
  }, 100);

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === "input")
        await sendRawKeys(sessionName, data.data || "");
      else if (data.type === "resize")
        await resizePane(sessionName, data.cols || 80, data.rows || 24);
      else if (data.type === "special")
        await sendSpecialKey(sessionName, data.key || "");
    } catch {}
  });

  ws.on("close", () => {
    streaming = false;
    clearInterval(poll);
  });
  ws.on("error", () => {
    streaming = false;
    clearInterval(poll);
  });
}

// ─── Start Next.js then attach WebSocket ───────────────────────────

require("next");
const { startServer } = require("next/dist/server/lib/start-server");

startServer({
  dir,
  isDev: false,
  config: nextConfig,
  hostname,
  port: currentPort,
  allowRetry: false,
})
  .then((app) => {
    // startServer returns the server instance — attach WebSocket upgrade handler
    const httpServer = app;

    const { WebSocketServer } = require("ws");
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request, socket, head) => {
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
        // Let Next.js handle other upgrades (HMR etc)
      }
    });

    console.log(`> webmux ready on http://${hostname}:${currentPort}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
