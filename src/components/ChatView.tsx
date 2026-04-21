"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { api } from "@/lib/api";

interface ChatMessage {
  role?: string;
  content?: string;
  content_type?: string;
  text?: string;
  tool_name?: string;
  result?: string | null;
  detail?: string | null;
  is_error?: boolean;
}

function esc(str: string): string {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function renderMarkdown(text: string): string {
  if (!text) return "";
  let html = esc(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (match) =>
    match.replace(/<br>/g, "\n")
  );
  return html;
}

/** Memoized message list — only re-renders when messages array changes */
const MessageList = memo(
  function MessageList({
    messages,
    innerRef,
  }: {
    messages: ChatMessage[];
    innerRef: React.RefObject<HTMLDivElement | null>;
  }) {
    return (
      <div className="chat-messages" ref={innerRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>No conversation yet.<br />Send a prompt to get started.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const ct = m.content_type;
            if (!ct) {
              return <div key={i} className={`chat-bubble ${m.role}`}>{m.content}</div>;
            }
            if (ct === "text") {
              if (m.role === "user") {
                return (
                  <div key={i} className="chat-bubble human">
                    {m.text?.split("\n").map((line, j) => (
                      <span key={j}>{line}{j < (m.text?.split("\n").length || 0) - 1 && <br />}</span>
                    ))}
                  </div>
                );
              }
              return (
                <div key={i} className="chat-bubble assistant"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text || "") }} />
              );
            }
            if (ct === "tool") {
              return (
                <div key={i} className="chat-bubble tool">
                  <div className="tool-summary">{m.text}</div>
                  {m.result && (
                    <div className={`tool-result-stats${m.is_error ? " tool-error" : ""}`}>{m.result}</div>
                  )}
                  {m.detail && (
                    <details className="tool-detail">
                      <summary>Show output</summary>
                      <pre>{m.detail}</pre>
                    </details>
                  )}
                </div>
              );
            }
            if (ct === "thinking") {
              return (
                <div key={i} className="chat-bubble thinking">
                  <details><summary>Thinking...</summary>
                    <div className="thinking-content">{m.text}</div>
                  </details>
                </div>
              );
            }
            return <div key={i} className={`chat-bubble ${m.role}`}>{m.text || m.content || ""}</div>;
          })
        )}
      </div>
    );
  }
);

export default function ChatView({
  sessionName,
}: {
  sessionName: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const userSelectingRef = useRef(false);
  const pendingUpdateRef = useRef<ChatMessage[] | null>(null);

  // Clear and reload when switching projects
  useEffect(() => {
    setMessages([]);
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionName}/chat`);
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages || []);
      } catch { /* SSE will pick up */ }
    })();
  }, [sessionName]);

  // SSE: live updates after initial load
  useEffect(() => {
    const eventSource = new EventSource(
      `/api/sessions/${sessionName}/chat-stream`
    );

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const msgs: ChatMessage[] = data.messages || [];
        if (userSelectingRef.current) {
          pendingUpdateRef.current = msgs;
        } else {
          setMessages(msgs);
        }
      } catch {
        /* ignore parse errors */
      }
    };

    eventSource.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => eventSource.close();
  }, [sessionName]);

  // Flush buffered update after selection ends
  useEffect(() => {
    const onSelectStart = () => {
      userSelectingRef.current = true;
    };
    const onMouseUp = () => {
      setTimeout(() => {
        userSelectingRef.current = false;
        if (pendingUpdateRef.current) {
          setMessages(pendingUpdateRef.current);
          pendingUpdateRef.current = null;
        }
      }, 300);
    };
    const el = messagesRef.current;
    if (!el) return;
    el.addEventListener("selectstart", onSelectStart);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (isAtBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;

    // Check if Claude is running before sending
    try {
      const state = await api.get(`/api/sessions/${sessionName}/ui-state`);
      if (!state.process || state.idle) {
        if (!confirm("Claude Code is not running. Send anyway?\n\nTip: Go to Terminal tab and click '▶ Claude Code' to start it.")) {
          return;
        }
      }
    } catch {
      // Can't check — send anyway
    }

    setInput("");
    try {
      await api.post(`/api/sessions/${sessionName}/send`, { text });
    } catch {
      alert("Failed to send. Check the Terminal tab.");
    }
  };

  const sendSpecial = async (key: string) => {
    try {
      await api.post(`/api/sessions/${sessionName}/send`, { special_key: key });
    } catch {
      /* ignore */
    }
  };

  const sendText = async (text: string) => {
    try {
      await api.post(`/api/sessions/${sessionName}/send`, { text });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="view-panel chat-view">
      <MessageList messages={messages} innerRef={messagesRef} />

      {/* Chat Input — always visible */}
      {(
        <div className="chat-input-area">
          <div className="chat-input-row">
            <textarea
              className="chat-input"
              placeholder="Type a prompt..."
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button className="send-btn" onClick={sendMessage}>
              &uarr;
            </button>
          </div>
          <div className="chat-shortcuts">
            <button
              className="shortcut-btn"
              onClick={() => sendSpecial("C-c")}
              title="Ctrl+C"
            >
              &#x2303;C
            </button>
            <button
              className="shortcut-btn"
              onClick={() => sendSpecial("Escape")}
              title="Escape"
            >
              Esc
            </button>
            <button
              className="shortcut-btn"
              onClick={() => sendText("y")}
              title="Yes + Enter"
            >
              y &#x21B5;
            </button>
            <button
              className="shortcut-btn"
              onClick={() => sendText("n")}
              title="No + Enter"
            >
              n &#x21B5;
            </button>
            <button
              className="shortcut-btn"
              onClick={() => { const el = messagesRef.current; if (el) el.scrollTop = el.scrollHeight; }}
              title="Refresh"
            >
              &#x27F3;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
