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
}

export default function SessionList({
  onOpenWorkspace,
}: {
  onOpenWorkspace: (name: string, sessions: SessionInfo[]) => void;
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
        <button
          className="icon-btn"
          title="New session"
          onClick={() => setShowModal(true)}
        >
          +
        </button>
      </header>
      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">&#x229E;</div>
            <p>
              No project sessions yet.
              <br />
              Create one to get started.
            </p>
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.name}
              className="session-card"
              onClick={() => onOpenWorkspace(s.name, sessions)}
            >
              <div className="session-dot" style={{ background: s.color }}>
                {s.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="session-card-info">
                <div className="session-card-name">{s.display_name}</div>
                <div className="session-card-meta">
                  {s.name} &middot; {s.activity}
                </div>
              </div>
              <div
                className={`session-card-status${s.attached ? " active" : ""}`}
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
