"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface TmuxWindow {
  index: number;
  name: string;
  active: boolean;
}

export default function TerminalView({
  sessionName,
}: {
  sessionName: string;
}) {
  const [windows, setWindows] = useState<TmuxWindow[]>([]);
  const [activeWindow, setActiveWindow] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Load windows list
  const loadWindows = useCallback(async () => {
    try {
      let data = await api.get(`/api/sessions/${sessionName}/windows`);
      if (!data || data.length === 0) {
        // Session doesn't exist — create it
        await api.post("/api/sessions", {
          name: sessionName,
          display_name: sessionName,
        }).catch(() => {});
        // Retry loading windows
        data = await api.get(`/api/sessions/${sessionName}/windows`);
      }
      setWindows(data || []);
    } catch {
      setWindows([]);
    }
  }, [sessionName]);

  useEffect(() => {
    loadWindows();
  }, [loadWindows]);

  // Connect PTY to active window
  useEffect(() => {
    if (windows.length === 0) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let terminal: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fitAddon: any = null;
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPong = Date.now();
    let reconnectAttempts = 0;

    const wsUrl = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const wsPort = process.env.NEXT_PUBLIC_WS_PORT;
      const wsHost = wsPort
        ? `${location.hostname}:${wsPort}`
        : location.host;
      return `${proto}//${wsHost}/ws/terminal/${sessionName}/${activeWindow}`;
    };

    function connect() {
      if (cancelled) return;
      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        reconnectAttempts = 0;
        lastPong = Date.now();
        if (ws && terminal) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            })
          );
        }
        // App-level heartbeat: probe every 25s; if no pong in 60s the
        // connection is stale — force close so onclose triggers reconnect.
        pingTimer = setInterval(() => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastPong > 60000) {
            try { ws.close(); } catch { /* ignore */ }
            return;
          }
          try { ws.send(JSON.stringify({ type: "ping" })); } catch { /* ignore */ }
        }, 25000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "output") {
            terminal?.write(msg.data);
          } else if (msg.type === "pong") {
            lastPong = Date.now();
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        if (cancelled) return;
        // Exponential backoff, capped at 10s.
        const delay = Math.min(500 * Math.pow(2, reconnectAttempts), 10000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(() => {
          if (!cancelled) connect();
        }, delay);
      };
    }

    // Force a quick liveness check when the tab/page becomes visible again.
    // Browsers often suspend timers while hidden, so the heartbeat may not
    // have fired in time to catch a connection killed during the idle period.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!ws) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      const probeStart = Date.now();
      try { ws.send(JSON.stringify({ type: "ping" })); } catch { /* ignore */ }
      setTimeout(() => {
        if (cancelled || !ws) return;
        if (lastPong < probeStart && ws.readyState === WebSocket.OPEN) {
          try { ws.close(); } catch { /* ignore */ }
        }
      }, 3000);
    };

    async function initTerminal() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      if (cancelled || !containerRef.current) return;

      // Clear previous terminal
      containerRef.current.innerHTML = "";

      terminal = new Terminal({
        theme: {
          background: "#0c0c0c",
          foreground: "#e0e0e0",
          cursor: "#e0e0e0",
        },
        fontSize: 13,
        fontFamily:
          "'SF Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace",
        cursorBlink: true,
        scrollback: 10000,
      });

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      setTimeout(() => fitAddon.fit(), 50);

      terminal.onData((data: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        fitAddon?.fit();
        if (ws && ws.readyState === WebSocket.OPEN && terminal) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            })
          );
        }
      });
      resizeObserver.observe(containerRef.current);

      document.addEventListener("visibilitychange", onVisibility);

      connect();

      cleanupRef.current = () => {
        document.removeEventListener("visibilitychange", onVisibility);
        resizeObserver.disconnect();
        if (pingTimer) clearInterval(pingTimer);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) {
          ws.onclose = null;
          try { ws.close(); } catch { /* ignore */ }
        }
        terminal?.dispose();
      };
    }

    initTerminal();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [sessionName, activeWindow, windows.length]);

  const addWindow = async () => {
    try {
      const w = await api.post(`/api/sessions/${sessionName}/windows`, {
        name: "shell",
      });
      await loadWindows();
      setActiveWindow(w.index);
    } catch {
      /* ignore */
    }
  };

  const closeWindow = async (index: number) => {
    if (windows.length <= 1) return; // don't close last window
    try {
      await api.del(`/api/sessions/${sessionName}/windows/${index}`);
      await loadWindows();
      if (activeWindow === index) {
        setActiveWindow(windows[0].index === index ? windows[1].index : windows[0].index);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="view-panel terminal-view">
      {/* Window tabs */}
      {windows.length > 0 && (
        <div className="terminal-window-tabs">
          {windows.map((w) => (
            <button
              key={w.index}
              className={`terminal-window-tab${activeWindow === w.index ? " active" : ""}`}
              onClick={() => setActiveWindow(w.index)}
            >
              <span className="terminal-window-name">
                {w.index === 0 ? "claude" : w.name}
              </span>
              {w.index !== 0 && (
                <span
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWindow(w.index);
                  }}
                >
                  &times;
                </span>
              )}
            </button>
          ))}
          <button className="terminal-window-tab add-tab" onClick={addWindow}>
            +
          </button>
        </div>
      )}

      {/* Terminal */}
      <div className="terminal-wrap">
        <div className="terminal-container" ref={containerRef} />
      </div>
      <div className="terminal-bar">
        <button
          className="terminal-claude-btn"
          onClick={() => {
            // Send claude command to the current tmux window via PTY
            const ws = cleanupRef.current;
            // Can't access ws directly, use API instead
            api.post(`/api/sessions/${sessionName}/send`, {
              text: "claude --dangerously-skip-permissions",
            }).catch(() => {});
          }}
        >
          ▶ Claude Code
        </button>
        <span className="terminal-focus-hint">
          Tap terminal to type
        </span>
      </div>
    </div>
  );
}
