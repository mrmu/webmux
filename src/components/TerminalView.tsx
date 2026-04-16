"use client";

import { useEffect, useRef } from "react";

export default function TerminalView({
  sessionName,
}: {
  sessionName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<{ terminal: unknown; ws: WebSocket | null } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initTerminal() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      if (cancelled || !containerRef.current) return;

      const terminal = new Terminal({
        theme: {
          background: "#0c0c0c",
          foreground: "#e0e0e0",
          cursor: "#e0e0e0",
        },
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace",
        cursorBlink: true,
        scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);

      // Small delay to let the DOM settle before fitting
      setTimeout(() => {
        fitAddon.fit();
      }, 50);

      // Connect WebSocket
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${proto}//${location.host}/ws/terminal/${sessionName}`
      );

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "output") {
            terminal.clear();
            terminal.write(msg.data);
          }
        } catch {
          /* ignore */
        }
      };

      ws.onopen = () => {
        // Send initial resize
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          })
        );
      };

      // Forward keyboard input
      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      // Handle resize
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

      termRef.current = { terminal, ws };

      return () => {
        resizeObserver.disconnect();
      };
    }

    const cleanupPromise = initTerminal();

    return () => {
      cancelled = true;
      cleanupPromise.then((cleanup) => cleanup?.());
      if (termRef.current) {
        if (termRef.current.ws) {
          termRef.current.ws.close();
        }
        (termRef.current.terminal as { dispose: () => void })?.dispose();
        termRef.current = null;
      }
    };
  }, [sessionName]);

  const sendSpecial = (key: string) => {
    const ws = termRef.current?.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "special", key }));
    }
  };

  return (
    <div className="view-panel terminal-view">
      <div className="terminal-wrap">
        <div className="terminal-container" ref={containerRef} />
      </div>
      <div className="terminal-bar">
        <button className="shortcut-btn" onClick={() => sendSpecial("C-c")}>
          &#x2303;C
        </button>
        <button className="shortcut-btn" onClick={() => sendSpecial("C-d")}>
          &#x2303;D
        </button>
        <button className="shortcut-btn" onClick={() => sendSpecial("C-z")}>
          &#x2303;Z
        </button>
        <button className="shortcut-btn" onClick={() => sendSpecial("Tab")}>
          Tab
        </button>
        <span className="terminal-focus-hint">Click terminal to type</span>
      </div>
    </div>
  );
}
