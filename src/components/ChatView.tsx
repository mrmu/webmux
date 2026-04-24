"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
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

interface SessionEntry {
  sessionId: string;
  mtime: number;
  preview: string;
  active: boolean;
  tmuxActive: boolean;
}

interface SessionsResponse {
  sessions: SessionEntry[];
  pinned: boolean;
  activeSessionId: string;
  tmuxSessionId: string;
}

function formatMtime(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function shortId(id: string): string {
  return id.slice(0, 8);
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
  prefill,
}: {
  sessionName: string;
  prefill?: { text: string; nonce: number } | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Optimistic echo: messages just sent by the user, shown immediately while
  // we wait for Claude Code to write them into JSONL and SSE to round-trip.
  // Entries are dropped once the real message appears in `messages`.
  const [pendingUserTexts, setPendingUserTexts] = useState<string[]>([]);
  const draftKey = `chat-draft:${sessionName}`;
  // Initialize from localStorage so the draft is present on first paint.
  // Wrapped because iOS private browsing historically threw on any access.
  const [input, setInput] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem(`chat-draft:${sessionName}`) || ""; }
    catch { return ""; }
  });
  const [sessionInfo, setSessionInfo] = useState<SessionsResponse | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bumped on pin/unpin to force the SSE stream to reconnect — otherwise the
  // server-side 3s polling interval delays the switch by up to 3 seconds
  // and stale events from the old session can flash through.
  const [streamEpoch, setStreamEpoch] = useState(0);
  // Current Claude Code status-line text, e.g. "Thinking... (5s)" — null when
  // Claude isn't busy. Drives a small indicator at the bottom of the message
  // list so the user knows the agent is working even before any reply lands.
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const userSelectingRef = useRef(false);
  const pendingUpdateRef = useRef<ChatMessage[] | null>(null);
  // Set on send to force scroll-to-bottom even when the user was scrolled up.
  const forceScrollRef = useRef(false);
  // Sticky-follow flag: true = auto-scroll on every new message. Flipped off
  // when the user scrolls up, back on when they return to the bottom.
  // Decoupling this from a per-update distance check avoids a large incoming
  // message silently pushing them past the threshold and breaking follow.
  const followRef = useRef(true);

  const loadSessions = useCallback(async () => {
    try {
      const data: SessionsResponse = await api.get(
        `/api/sessions/${sessionName}/chat-sessions`
      );
      setSessionInfo(data);
    } catch {
      /* ignore */
    }
  }, [sessionName]);

  // Refresh the picker periodically so newly-created JSONL files appear in
  // the dropdown without needing the resolved session to change. The SSE
  // stream only calls loadSessions() on sessionId flip, which doesn't fire
  // when a pin is set and the pinned file still exists — so a fresh Claude
  // session started in terminal would otherwise be invisible here until
  // the user forced a reload.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadSessions();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [loadSessions]);

  // Re-load draft when sessionName changes — covers the case where ChatView
  // isn't remounted across project switches (useState init only runs once).
  useEffect(() => {
    try { setInput(localStorage.getItem(draftKey) || ""); }
    catch { /* ignore */ }
  }, [draftKey]);

  // Prefill from an external action (e.g. Notes "Ask AI" button). The nonce
  // is part of the dep so the same text can be prefilled twice in a row.
  useEffect(() => {
    if (!prefill) return;
    setInput(prefill.text);
    try { localStorage.setItem(draftKey, prefill.text); } catch { /* ignore */ }
  }, [prefill, draftKey]);

  // Poll ui-state for Claude Code's own status-line text ("Thinking...",
  // "Compacting...", etc.). Pauses when the tab isn't visible to save cycles.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const s = await api.get(`/api/sessions/${sessionName}/ui-state`);
        if (cancelled) return;
        setAiStatus(typeof s?.status === "string" && s.status ? s.status : null);
      } catch {
        // On failure, leave previous state rather than flashing null.
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionName]);

  // Clear and reload when switching projects (or mounting — this also covers
  // page refresh, where we always want to jump to the latest message).
  useEffect(() => {
    setMessages([]);
    setPendingUserTexts([]);
    loadSessions();
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionName}/chat`);
        if (!res.ok) return;
        const data = await res.json();
        // Set the force-scroll flag right before the messages arrive so the
        // scroll effect sees it in the same render cycle. Setting it earlier
        // would get consumed by the empty-state render triggered above.
        forceScrollRef.current = true;
        setMessages(data.messages || []);
      } catch { /* SSE will pick up */ }
    })();
  }, [sessionName, loadSessions]);

  // Drop optimistic entries whose text has landed in the real log,
  // then apply the latest messages (buffering if user is selecting text).
  const applyLatestMessages = useCallback((msgs: ChatMessage[]) => {
    const realUserTexts = new Set(
      msgs
        .filter((m) => m.role === "user" && m.content_type === "text" && m.text)
        .map((m) => m.text as string)
    );
    setPendingUserTexts((prev) => {
      const next = prev.filter((t) => !realUserTexts.has(t));
      return next.length === prev.length ? prev : next;
    });
    if (userSelectingRef.current) {
      pendingUpdateRef.current = msgs;
    } else {
      setMessages(msgs);
    }
  }, []);

  // SSE: live updates after initial load
  useEffect(() => {
    const eventSource = new EventSource(
      `/api/sessions/${sessionName}/chat-stream`
    );

    let lastSessionId = "";
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        applyLatestMessages(data.messages || []);
        // Session switched server-side — refresh picker badges
        if (data.sessionId && data.sessionId !== lastSessionId) {
          lastSessionId = data.sessionId;
          loadSessions();
        }
      } catch {
        /* ignore parse errors */
      }
    };

    eventSource.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => eventSource.close();
  }, [sessionName, applyLatestMessages, loadSessions, streamEpoch]);

  const reloadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionName}/chat`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      /* SSE will pick up */
    }
  }, [sessionName]);

  // Mobile screen-off can leave the SSE connection in a "sleeping" state —
  // radio suspends, events queue up in the kernel TCP buffer, and the browser
  // doesn't reconnect when we return because the socket never errored.
  // Re-fetch the latest state on visibilitychange so we never wait for the
  // next fs.watch event to trickle through the stalled pipe.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/sessions/${sessionName}/chat`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) applyLatestMessages(data.messages || []);
        })
        .catch(() => { /* ignore — SSE / next visibility will retry */ });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sessionName, applyLatestMessages]);

  // After a session switch, jump to the latest message — ignore the usual
  // "only scroll if near bottom" check, which is meaningless across sessions.
  const scrollToBottomRef = useRef(false);

  const pickSession = async (id: string) => {
    try {
      await api.put(`/api/sessions/${sessionName}/chat-sessions`, { sessionId: id });
      setPickerOpen(false);
      setMessages([]);
      scrollToBottomRef.current = true;
      await reloadMessages();
      setStreamEpoch((v) => v + 1);
      loadSessions();
    } catch {
      /* ignore */
    }
  };

  const unpinSession = async () => {
    try {
      await api.put(`/api/sessions/${sessionName}/chat-sessions`, { unpin: true });
      setMessages([]);
      scrollToBottomRef.current = true;
      await reloadMessages();
      setStreamEpoch((v) => v + 1);
      loadSessions();
    } catch {
      /* ignore */
    }
  };

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

  // Watch user scroll to toggle followRef: near-bottom → on, away → off.
  // 40px tolerance accommodates sub-pixel rounding and mobile rubber-banding.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      followRef.current = atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    // Hard overrides (session switch / send) always jump to bottom and also
    // re-engage follow so subsequent chunks keep scrolling.
    if (scrollToBottomRef.current || forceScrollRef.current) {
      scrollToBottomRef.current = false;
      forceScrollRef.current = false;
      followRef.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (followRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pendingUserTexts]);

  // Merge real messages with pending optimistic ones for display.
  // When nothing is pending, returns the same reference as `messages` so
  // the memoized MessageList can skip re-rendering on unrelated updates.
  const displayMessages = useMemo<ChatMessage[]>(() => {
    if (pendingUserTexts.length === 0) return messages;
    return [
      ...messages,
      ...pendingUserTexts.map((text) => ({
        role: "user",
        content_type: "text",
        text,
      })),
    ];
  }, [messages, pendingUserTexts]);

  const [sendError, setSendError] = useState("");

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setSendError("");

    // Show the user's prompt + scroll right away. The ui-state check + tmux
    // send can take seconds on a busy session; the echo should never wait.
    forceScrollRef.current = true;
    setPendingUserTexts((prev) => [...prev, text]);
    setInput("");
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }

    // Remove the first matching entry so duplicate sends of the same text
    // don't all vanish on a single failure.
    const rollback = () => {
      setPendingUserTexts((prev) => {
        const idx = prev.indexOf(text);
        if (idx < 0) return prev;
        const copy = [...prev];
        copy.splice(idx, 1);
        return copy;
      });
    };

    try {
      const state = await api.get(`/api/sessions/${sessionName}/ui-state`);
      if (!state.process || state.idle) {
        setSendError("Claude Code is not running. Start it from the Terminal tab.");
        rollback();
        return;
      }
    } catch {
      // Can't check — send anyway
    }

    try {
      await api.post(`/api/sessions/${sessionName}/send`, { text });
    } catch {
      setSendError("Failed to send. Check the Terminal tab.");
      rollback();
    }
  };

  const active = sessionInfo?.sessions.find((s) => s.active);
  const activeMode: "pinned" | "tmux" | "latest" = sessionInfo?.pinned
    ? "pinned"
    : active?.tmuxActive
      ? "tmux"
      : "latest";
  const activeIcon = activeMode === "pinned" ? "📌" : activeMode === "tmux" ? "🖥" : "⏱";
  const activeLabel = activeMode === "pinned" ? "pinned" : activeMode === "tmux" ? "tmux" : "latest";

  // Viewing a session that's NOT what tmux's claude is writing to — anything
  // you send via the input goes to tmux's current session, NOT the one on
  // screen. That's a UX trap, so we show a warning and offer a one-click
  // jump to the session tmux is actually running.
  const tmuxMismatch =
    !!sessionInfo?.tmuxSessionId &&
    !!sessionInfo?.activeSessionId &&
    sessionInfo.tmuxSessionId !== sessionInfo.activeSessionId;

  return (
    <div className="view-panel chat-view">
      {sessionInfo && sessionInfo.sessions.length > 0 && (
        <div className="chat-session-bar">
          <button
            className="chat-session-trigger"
            onClick={() => setPickerOpen((v) => !v)}
            title="Switch chat session"
          >
            <span className="chat-session-icon">{activeIcon}</span>
            <span className="chat-session-code">
              {active ? shortId(active.sessionId) : "—"}
            </span>
            <span className="chat-session-mode">{activeLabel}</span>
            <span className="chat-session-caret">{pickerOpen ? "▲" : "▼"}</span>
          </button>
          {sessionInfo.pinned && (
            <button
              className="chat-session-unpin"
              onClick={unpinSession}
              title="Unpin — resume auto-follow"
            >
              unpin
            </button>
          )}
          {pickerOpen && (
            <div className="chat-session-dropdown">
              {sessionInfo.sessions.map((s) => (
                <button
                  key={s.sessionId}
                  className={`chat-session-option${s.active ? " active" : ""}`}
                  onClick={() => pickSession(s.sessionId)}
                >
                  <div className="chat-session-option-head">
                    {s.tmuxActive && <span title="Running in tmux">🖥</span>}
                    {s.active && sessionInfo.pinned && <span title="Pinned">📌</span>}
                    {s.active && !sessionInfo.pinned && <span title="Showing">●</span>}
                    <span className="chat-session-option-id">{shortId(s.sessionId)}</span>
                    <span className="chat-session-option-time">{formatMtime(s.mtime)}</span>
                  </div>
                  {s.preview && (
                    <div className="chat-session-option-preview">{s.preview}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <MessageList messages={displayMessages} innerRef={messagesRef} />

      {/* Chat Input — always visible */}
      {(
        <div className="chat-input-area">
          {aiStatus && (
            <div className="chat-ai-status" title="Live status from Claude Code">
              <span className="chat-ai-status-dot" />
              <span className="chat-ai-status-text">{aiStatus}</span>
            </div>
          )}
          {tmuxMismatch && (
            <div className="chat-mismatch-warn">
              <span>
                看的是 <code>{shortId(sessionInfo!.activeSessionId)}</code>，但 terminal 跑的是{" "}
                <code>{shortId(sessionInfo!.tmuxSessionId)}</code>。訊息送出會進入 terminal 的 session。
              </span>
              <button
                className="chat-mismatch-jump"
                onClick={() => pickSession(sessionInfo!.tmuxSessionId)}
              >
                切到 🖥
              </button>
            </div>
          )}
          {sendError && (
            <div className="chat-send-error">{sendError}</div>
          )}
          <div className="chat-input-row">
            <textarea
              className="chat-input"
              placeholder="Type a prompt..."
              rows={1}
              value={input}
              onChange={(e) => {
                const v = e.target.value;
                setInput(v);
                try {
                  if (v) localStorage.setItem(draftKey, v);
                  else localStorage.removeItem(draftKey);
                } catch { /* ignore — iOS private mode etc. */ }
                if (sendError) setSendError("");
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
        </div>
      )}
    </div>
  );
}
