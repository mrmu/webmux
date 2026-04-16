"use client";

import { useEffect, useRef } from "react";

export default function TerminalView({
  sessionName,
}: {
  sessionName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

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
        fontFamily:
          "'SF Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace",
        cursorBlink: true,
        scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);

      setTimeout(() => fitAddon.fit(), 50);

      // Connect WebSocket (PTY-backed)
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${proto}//${location.host}/ws/terminal/${sessionName}`
      );

      ws.onopen = () => {
        // Send initial size so PTY starts with correct dimensions
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
            // PTY stream — write directly, no clear needed
            terminal.write(msg.data);
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        terminal.write("\r\n\x1b[90m[session disconnected]\x1b[0m\r\n");
      };

      // Forward keyboard input to PTY
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
  }, [sessionName]);

  const sendSpecial = (key: string) => {
    // For PTY mode, special keys are sent as ANSI escape sequences
    // through xterm.js onData handler, so these buttons aren't needed
    // But we keep them for mobile convenience — send raw escape codes
    // Not needed with PTY — xterm handles keyboard natively
  };

  return (
    <div className="view-panel terminal-view">
      <div className="terminal-wrap">
        <div className="terminal-container" ref={containerRef} />
      </div>
      <div className="terminal-bar">
        <span className="terminal-focus-hint">
          Tap terminal to type &middot; PTY mode
        </span>
      </div>
    </div>
  );
}
