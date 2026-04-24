"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import NewSessionModal from "@/components/NewSessionModal";

interface SessionInfo {
  name: string;
  display_name: string;
  color: string;
  running: boolean;
  cwd: string;
  command: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showModal, setShowModal] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api.get("/api/sessions"));
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  return (
    <div className="screen">
      <header className="top-bar">
        <img src="/logo-robot.png" alt="" className="top-logo" />
        <h1 className="top-title">Projects</h1>
        <button className="icon-btn" title="Issues" onClick={() => router.push("/issues")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>
          </svg>
        </button>
        <button className="icon-btn" title="Account" onClick={() => router.push("/account")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
        <button className="icon-btn" title="New project" onClick={() => setShowModal(true)}>+</button>
      </header>
      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">&#x229E;</div>
            <p>No projects yet.<br />Create one to get started.</p>
          </div>
        ) : (
          sessions.map((s) => (
            <div key={s.name} className="session-card" onClick={() => {
              if (s.running) {
                router.push(`/projects/${s.name}`);
              } else {
                (async () => {
                  try {
                    await api.post("/api/sessions", {
                      name: s.name, display_name: s.display_name,
                      cwd: s.cwd, command: s.command, color: s.color,
                    });
                    loadSessions();
                  } catch { /* ignore */ }
                })();
              }
            }}>
              <div className="session-dot" style={{ background: s.color, opacity: s.running ? 1 : 0.4 }}>
                {s.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="session-card-info">
                <div className="session-card-name">{s.display_name}</div>
                <div className="session-card-meta">{s.name} &middot; {s.running ? "running" : "stopped"}</div>
              </div>
              <div className={`session-card-status${s.running ? " active" : ""}`} />
            </div>
          ))
        )}
      </div>
      {showModal && (
        <NewSessionModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); loadSessions(); }}
        />
      )}
    </div>
  );
}
