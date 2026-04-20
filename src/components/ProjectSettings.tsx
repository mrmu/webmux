"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#ef4444", "#64748b",
];

interface Host {
  id: number;
  name: string;
  ssh_target: string;
  env: string;
  description: string;
}

interface ChatSession {
  sessionId: string;
  mtime: number;
  active: boolean;
}

export default function ProjectSettings({
  projectName,
  onClose,
  onDeleted,
}: {
  projectName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  // Project info
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [cwd, setCwd] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [saving, setSaving] = useState(false);

  // Hosts
  const [hosts, setHosts] = useState<Host[]>([]);
  const [newHost, setNewHost] = useState({ name: "", ssh_target: "", env: "production" });

  // Chat sessions
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);

  // CLAUDE.md status
  const [claudeMd, setClaudeMd] = useState<{
    exists: boolean;
    hasDeploy: boolean;
    deploySections: { title: string; body: string }[];
    allSections: string[];
  } | null>(null);

  const loadProject = useCallback(async () => {
    try {
      const sessions = await api.get("/api/sessions");
      const p = sessions.find((s: { name: string }) => s.name === projectName);
      if (p) {
        setDisplayName(p.display_name);
        setColor(p.color);
        setCwd(p.cwd);
        setRepoUrl(p.repo_url || "");
        // Don't overwrite token placeholder — only set if empty
        if (!p.repo_token) setRepoToken("");
      }
    } catch { /* ignore */ }
  }, [projectName]);

  const loadHosts = useCallback(async () => {
    try {
      const data = await api.get(`/api/sessions/${projectName}/hosts`);
      setHosts(data.map((h: Record<string, unknown>) => ({
        id: h.id as number,
        name: h.name as string,
        ssh_target: h.sshTarget as string,
        env: h.env as string,
        description: (h.description || "") as string,
      })));
    } catch { setHosts([]); }
  }, [projectName]);

  const loadChatSessions = useCallback(async () => {
    try {
      setChatSessions(await api.get(`/api/sessions/${projectName}/chat-sessions`));
    } catch { setChatSessions([]); }
  }, [projectName]);

  const loadClaudeMd = useCallback(async () => {
    try {
      setClaudeMd(await api.get(`/api/sessions/${projectName}/claudemd`));
    } catch { setClaudeMd(null); }
  }, [projectName]);

  useEffect(() => {
    loadProject();
    loadHosts();
    loadChatSessions();
    loadClaudeMd();
  }, [loadProject, loadHosts, loadChatSessions, loadClaudeMd]);

  const saveProject = async () => {
    setSaving(true);
    try {
      await api.put(`/api/projects/${projectName}`, {
        display_name: displayName,
        color,
        cwd,
        repo_url: repoUrl,
        // Only send token if user typed a new one (not the masked "***")
        ...(repoToken && repoToken !== "***" && { repo_token: repoToken }),
      });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const addHost = async () => {
    if (!newHost.name || !newHost.ssh_target) return;
    try {
      await api.post(`/api/sessions/${projectName}/hosts`, newHost);
      setNewHost({ name: "", ssh_target: "", env: "production" });
      loadHosts();
    } catch { /* ignore */ }
  };

  const deleteHost = async (id: number) => {
    await api.del(`/api/sessions/${projectName}/hosts/${id}`);
    loadHosts();
  };

  const selectChatSession = async (sessionId: string) => {
    await api.put(`/api/sessions/${projectName}/chat-sessions`, { sessionId });
    loadChatSessions();
  };

  const deleteProject = async () => {
    if (!confirm(`Delete project "${displayName || projectName}"? This removes the DB record and kills the tmux session.`)) return;
    await api.del(`/api/sessions/${projectName}`);
    onDeleted();
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Project Settings</h2>
        <button className="icon-btn" onClick={onClose}>&#x2715;</button>
      </div>

      <div className="settings-content">
        {/* Basic Info */}
        <section className="settings-section">
          <h3>General</h3>
          <label>
            Display Name
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>
            Working Directory
            <input type="text" value={cwd} onChange={(e) => setCwd(e.target.value)} />
          </label>
          <label>
            Repository URL
            <input type="url" placeholder="https://github.com/user/repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
          </label>
          <label>
            Repository Token (PAT)
            <input type="password" placeholder={repoToken ? "••••••" : "GitHub/Bitbucket personal access token"} value={repoToken === "***" ? "" : repoToken} onChange={(e) => setRepoToken(e.target.value)} />
          </label>
          <label>
            Color
            <div className="color-picker">
              {COLORS.map((c) => (
                <button key={c} type="button"
                  className={`color-dot${color === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </label>
          <button className="btn-primary" onClick={saveProject} disabled={saving}
            style={{ marginTop: "0.5rem", flex: "none", padding: "0.5rem 1.5rem" }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </section>

        {/* Hosts */}
        <section className="settings-section">
          <h3>Hosts</h3>
          {hosts.length === 0 ? (
            <p className="settings-hint">No hosts configured</p>
          ) : (
            <div className="host-list">
              {hosts.map((h) => (
                <div key={h.id} className="host-item">
                  <span className={`host-env ${h.env}`}>{h.env}</span>
                  <span className="host-name">{h.name}</span>
                  <span className="host-target">ssh {h.ssh_target}</span>
                  <button className="host-delete" onClick={() => deleteHost(h.id)}>&times;</button>
                </div>
              ))}
            </div>
          )}
          <div className="host-add">
            <input type="text" placeholder="Name (e.g. GCP Prod)"
              value={newHost.name} onChange={(e) => setNewHost({ ...newHost, name: e.target.value })} />
            <input type="text" placeholder="SSH target (e.g. gcp-prod)"
              value={newHost.ssh_target} onChange={(e) => setNewHost({ ...newHost, ssh_target: e.target.value })} />
            <select value={newHost.env} onChange={(e) => setNewHost({ ...newHost, env: e.target.value })}>
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="development">development</option>
            </select>
            <button className="btn-primary" onClick={addHost}
              style={{ flex: "none", padding: "0.4rem 0.8rem" }}>Add</button>
          </div>
        </section>

        {/* CLAUDE.md Status */}
        <section className="settings-section">
          <h3>CLAUDE.md</h3>
          {!claudeMd ? (
            <p className="settings-hint">Loading...</p>
          ) : !claudeMd.exists ? (
            <div className="claudemd-status missing">
              <span className="claudemd-icon">&#x26A0;</span>
              <span>No CLAUDE.md found in project directory</span>
            </div>
          ) : (
            <>
              <div className={`claudemd-status ${claudeMd.hasDeploy ? "ok" : "warn"}`}>
                <span className="claudemd-icon">{claudeMd.hasDeploy ? "&#x2705;" : "&#x26A0;"}</span>
                <span>
                  {claudeMd.hasDeploy
                    ? "Deploy instructions found"
                    : "No deploy instructions detected"}
                </span>
              </div>
              {claudeMd.allSections.length > 0 && (
                <p className="settings-hint">
                  Sections: {claudeMd.allSections.join(", ")}
                </p>
              )}
              {claudeMd.hasDeploy && claudeMd.deploySections.map((s, i) => (
                <details key={i} className="claudemd-deploy-section">
                  <summary>{s.title}</summary>
                  <pre>{s.body}</pre>
                </details>
              ))}
            </>
          )}
        </section>

        {/* Chat Session */}
        {chatSessions.length > 1 && (
          <section className="settings-section">
            <h3>Chat Session</h3>
            <p className="settings-hint">Multiple Claude Code sessions found. Select which one to show in Chat view:</p>
            <div className="chat-session-list">
              {chatSessions.map((s) => (
                <button key={s.sessionId}
                  className={`chat-session-item${s.active ? " active" : ""}`}
                  onClick={() => selectChatSession(s.sessionId)}>
                  <span className="chat-session-id">{s.sessionId.slice(0, 8)}...</span>
                  <span className="chat-session-time">
                    {new Date(s.mtime).toLocaleString()}
                  </span>
                  {s.active && <span className="chat-session-badge">active</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Danger Zone */}
        <section className="settings-section danger-zone">
          <h3>Danger Zone</h3>
          <button className="btn-danger" onClick={deleteProject}>
            Delete Project
          </button>
        </section>
      </div>
    </div>
  );
}
