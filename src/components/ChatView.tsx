"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

export default function ChatView({
  sessionName,
  uiState,
}: {
  sessionName: string;
  uiState: {
    interactive: boolean;
    type: string | null;
    status: string | null;
    idle: boolean;
    process: string | null;
  } | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastHashRef = useRef("");
  const pollingRef = useRef(false);
  const userSelectingRef = useRef(false);

  const refreshChat = useCallback(async () => {
    if (pollingRef.current) return;
    // Don't update DOM while user is selecting text
    if (userSelectingRef.current) return;
    pollingRef.current = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`/api/sessions/${sessionName}/chat`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: ChatMessage[] = data.messages || [];
      const hash =
        msgs.length +
        ":" +
        (msgs[msgs.length - 1]?.text || "").length +
        ":" +
        (msgs[msgs.length - 1]?.result || "");
      if (hash === lastHashRef.current) return;
      // Double-check selection hasn't started during fetch
      if (userSelectingRef.current) return;
      lastHashRef.current = hash;
      setMessages(msgs);
    } catch {
      /* timeout or network error — will retry next tick */
    } finally {
      pollingRef.current = false;
    }
  }, [sessionName]);

  useEffect(() => {
    refreshChat();
    const interval = setInterval(refreshChat, 2000);
    return () => clearInterval(interval);
  }, [refreshChat]);

  // Pause updates while user is selecting text
  useEffect(() => {
    const onSelectStart = () => { userSelectingRef.current = true; };
    const onMouseUp = () => {
      // Small delay so the copy action can complete
      setTimeout(() => { userSelectingRef.current = false; }, 500);
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
    setInput("");
    try {
      await api.post(`/api/sessions/${sessionName}/send`, { text });
      setTimeout(refreshChat, 300);
    } catch (e) {
      alert("Failed to send: " + (e as Error).message);
    }
  };

  const sendSpecial = async (key: string) => {
    try {
      await api.post(`/api/sessions/${sessionName}/send`, { special_key: key });
      setTimeout(refreshChat, 300);
    } catch {
      /* ignore */
    }
  };

  const sendText = async (text: string) => {
    try {
      await api.post(`/api/sessions/${sessionName}/send`, { text });
      setTimeout(refreshChat, 300);
    } catch {
      /* ignore */
    }
  };

  const [restarting, setRestarting] = useState(false);

  const restartClaude = async () => {
    setRestarting(true);
    try {
      await api.post(`/api/sessions/${sessionName}/send`, {
        text: "claude --dangerously-skip-permissions",
      });
      // Give it time to start, then refresh UI state
      setTimeout(() => {
        refreshChat();
        setRestarting(false);
      }, 3000);
    } catch {
      setRestarting(false);
    }
  };

  return (
    <div className="view-panel chat-view">
      <div className="chat-messages" ref={messagesRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>
              No conversation yet.
              <br />
              Send a prompt to get started.
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const ct = m.content_type;
            if (!ct) {
              return (
                <div key={i} className={`chat-bubble ${m.role}`}>
                  {m.content}
                </div>
              );
            }
            if (ct === "text") {
              if (m.role === "user") {
                return (
                  <div key={i} className="chat-bubble human">
                    {m.text?.split("\n").map((line, j) => (
                      <span key={j}>
                        {line}
                        {j < (m.text?.split("\n").length || 0) - 1 && <br />}
                      </span>
                    ))}
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className="chat-bubble assistant"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(m.text || ""),
                  }}
                />
              );
            }
            if (ct === "tool") {
              return (
                <div key={i} className="chat-bubble tool">
                  <div className="tool-summary">{m.text}</div>
                  {m.result && (
                    <div
                      className={`tool-result-stats${m.is_error ? " tool-error" : ""}`}
                    >
                      {m.result}
                    </div>
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
                  <details>
                    <summary>Thinking...</summary>
                    <div className="thinking-content">{m.text}</div>
                  </details>
                </div>
              );
            }
            return (
              <div key={i} className={`chat-bubble ${m.role}`}>
                {m.text || m.content || ""}
              </div>
            );
          })
        )}
      </div>

      {/* Idle Banner */}
      {uiState?.idle && (
        <div className="idle-banner">
          <span className="idle-text">
            {uiState.process || "shell"} is idle
          </span>
          <button
            className="idle-restart-btn"
            onClick={restartClaude}
            disabled={restarting}
          >
            {restarting ? "Starting..." : "Start Claude"}
          </button>
        </div>
      )}

      {/* Interactive Navigation */}
      {uiState?.interactive && !uiState?.idle && (
        <div className="interactive-nav">
          <div className="nav-row">
            <button className="nav-btn" onClick={() => sendSpecial("Space")}>
              &#x2423; Space
            </button>
            <button className="nav-btn" onClick={() => sendSpecial("Up")}>
              &uarr;
            </button>
            <button className="nav-btn" onClick={() => sendSpecial("Tab")}>
              &#x21E5; Tab
            </button>
          </div>
          {uiState.type !== "RestoreCheckpoint" && (
            <div className="nav-row">
              <button className="nav-btn" onClick={() => sendSpecial("Left")}>
                &larr;
              </button>
              <button className="nav-btn" onClick={() => sendSpecial("Down")}>
                &darr;
              </button>
              <button className="nav-btn" onClick={() => sendSpecial("Right")}>
                &rarr;
              </button>
            </div>
          )}
          <div className="nav-row">
            <button className="nav-btn" onClick={() => sendSpecial("Escape")}>
              &#x238B; Esc
            </button>
            <button className="nav-btn" onClick={refreshChat}>
              &#x1F504;
            </button>
            <button className="nav-btn" onClick={() => sendSpecial("Enter")}>
              &#x23CE; Enter
            </button>
          </div>
        </div>
      )}

      {/* Chat Input */}
      {!uiState?.interactive && !uiState?.idle && (
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
              onClick={refreshChat}
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
