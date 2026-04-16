/**
 * Production server for standalone Next.js + WebSocket.
 * This file is copied into the standalone output and runs as the entry point.
 */

const { createServer } = require("http");
const { parse } = require("url");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// Next.js standalone handler
process.env.NODE_ENV = "production";
const NextServer =
  require("next/dist/server/next-server").default;

const nextServer = new NextServer({
  hostname: "0.0.0.0",
  port: parseInt(process.env.PORT || "3000", 10),
  dir: path.join(__dirname),
  dev: false,
  customServer: true,
  conf: require(path.join(__dirname, ".next", "required-server-files.json"))
    .config,
});

const handle = nextServer.getRequestHandler();

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

// ─── Server ────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || "3000", 10);

const server = createServer(async (req, res) => {
  const parsedUrl = parse(req.url, true);
  await handle(req, res, parsedUrl);
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
      if (data.type === "input") await sendRawKeys(sessionName, data.data || "");
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

nextServer.prepare().then(() => {
  server.listen(port, "0.0.0.0", () => {
    console.log(`> webmux ready on http://0.0.0.0:${port}`);
  });
});
