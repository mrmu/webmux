"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import NewSessionModal from "./NewSessionModal";

export interface SessionInfo {
  name: string;
  display_name: string;
  description: string;
  color: string;
  created: string;
  attached: boolean;
  width: number;
  height: number;
  activity: string;
  running: boolean;
  cwd: string;
  command: string;
}

export default function SessionList({
  onOpenWorkspace,
  onOpenAccount,
}: {
  onOpenWorkspace: (name: string, sessions: SessionInfo[]) => void;
  onOpenAccount: () => void;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showModal, setShowModal] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.get("/api/sessions");
      setSessions(data);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="screen">
      <header className="top-bar">
        <h1 className="top-title">Projects</h1>
        <button className="icon-btn" title="Account" onClick={onOpenAccount}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
        <button className="icon-btn" title="New project" onClick={() => setShowModal(true)}>
          +
        </button>
      </header>
      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">&#x229E;</div>
            <p>
              No projects yet.
              <br />
              Create one to get started.
            </p>
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.name}
              className="session-card"
              onClick={() => {
                if (s.running) {
                  onOpenWorkspace(s.name, sessions);
                } else {
                  // Restart stopped session
                  (async () => {
                    try {
                      await api.post("/api/sessions", {
                        name: s.name,
                        display_name: s.display_name,
                        cwd: s.cwd,
                        command: s.command,
                        color: s.color,
                      });
                      loadSessions();
                    } catch {
                      /* ignore */
                    }
                  })();
                }
              }}
            >
              <div
                className="session-dot"
                style={{
                  background: s.color,
                  opacity: s.running ? 1 : 0.4,
                }}
              >
                {s.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="session-card-info">
                <div className="session-card-name">{s.display_name}</div>
                <div className="session-card-meta">
                  {s.name} &middot; {s.running ? "running" : "stopped"}
                </div>
              </div>
              <div
                className={`session-card-status${s.running ? " active" : ""}`}
              />
            </div>
          ))
        )}
      </div>
      {showModal && (
        <NewSessionModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            loadSessions();
          }}
        />
      )}
    </div>
  );
}
