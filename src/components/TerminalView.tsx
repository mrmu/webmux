"use client";

import { useEffect, useRef, useState } from "react";

export default function TerminalView({
  sessionName,
}: {
  sessionName: string;
}) {
  const [output, setOutput] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${location.host}/ws/terminal/${sessionName}`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "output") {
          setOutput(msg.data);
        }
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionName]);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    const isAtBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (isAtBottom) el.scrollTop = el.scrollHeight;
  }, [output]);

  const sendSpecial = (key: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "special", key }));
    }
  };

  const sendInput = (data: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const key = e.key;
    let handled = true;

    if (e.ctrlKey && key.length === 1) {
      sendSpecial(`C-${key.toLowerCase()}`);
    } else if (key === "Enter") {
      sendSpecial("Enter");
    } else if (key === "Backspace") {
      sendSpecial("BSpace");
    } else if (key === "Delete") {
      sendSpecial("DC");
    } else if (key === "Tab") {
      sendSpecial("Tab");
    } else if (key === "Escape") {
      sendSpecial("Escape");
    } else if (key === "ArrowUp") {
      sendSpecial("Up");
    } else if (key === "ArrowDown") {
      sendSpecial("Down");
    } else if (key === "ArrowLeft") {
      sendSpecial("Left");
    } else if (key === "ArrowRight") {
      sendSpecial("Right");
    } else {
      handled = false;
    }

    if (handled) e.preventDefault();
  };

  const handleInput = () => {
    const el = inputRef.current;
    if (!el) return;
    const text = el.value;
    if (text) {
      sendInput(text);
      el.value = "";
    }
  };

  return (
    <div className="view-panel terminal-view">
      <div className="terminal-wrap">
        <div
          ref={outputRef}
          className="terminal-output"
          onClick={() => inputRef.current?.focus()}
        >
          {output}
        </div>
        <textarea
          ref={inputRef}
          className="term-input-hidden"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
        />
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
        <span className="terminal-focus-hint">Tap terminal to type</span>
      </div>
    </div>
  );
}
