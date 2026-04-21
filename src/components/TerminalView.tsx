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
      const data = await api.get(`/api/sessions/${sessionName}/windows`);
      setWindows(data);
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

    async function initTerminal() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      if (cancelled || !containerRef.current) return;

      // Clear previous terminal
      containerRef.current.innerHTML = "";

      const terminal = new Terminal({
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

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      setTimeout(() => fitAddon.fit(), 50);

      // Connect WebSocket with window index
      // Dev: terminal WS on separate port (3001); Prod: same host
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const wsPort = process.env.NEXT_PUBLIC_WS_PORT;
      const wsHost = wsPort
        ? `${location.hostname}:${wsPort}`
        : location.host;
      const ws = new WebSocket(
        `${proto}//${wsHost}/ws/terminal/${sessionName}/${activeWindow}`
      );

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          })
        );
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "output") {
            terminal.write(msg.data);
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        terminal.write("\r\n\x1b[90m[disconnected]\x1b[0m\r\n");
      };

      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
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

      cleanupRef.current = () => {
        resizeObserver.disconnect();
        ws.close();
        terminal.dispose();
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
