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
  const [deployDoc, setDeployDoc] = useState("");
  const [testDoc, setTestDoc] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  // Hosts
  const [hosts, setHosts] = useState<Host[]>([]);
  const [newHost, setNewHost] = useState({ name: "", ssh_target: "", env: "production" });

  // Chat sessions
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);

  // CLAUDE.md status
  const [claudeMd, setClaudeMd] = useState<{
    exists: boolean;
    hasDeploy: boolean;
    hasWebmuxPointer: boolean;
    deploySections: { title: string; body: string }[];
    allSections: string[];
  } | null>(null);
  const [pointerBusy, setPointerBusy] = useState(false);

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
        setDeployDoc(p.deploy_doc || "");
        setTestDoc(p.test_doc || "");
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
        deploy_doc: deployDoc,
        test_doc: testDoc,
      });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const syncWebmux = async () => {
    setSyncBusy(true);
    try {
      await api.post(`/api/sessions/${projectName}/webmux/sync`, {});
      await loadProject();
      await loadClaudeMd();
    } catch { /* ignore */ }
    setSyncBusy(false);
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

  const addWebmuxPointer = async () => {
    setPointerBusy(true);
    try {
      await api.post(`/api/sessions/${projectName}/claudemd`, {});
      await loadClaudeMd();
    } catch { /* ignore */ }
    setPointerBusy(false);
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
        {/* General */}
        <section className="settings-section">
          <h3>General</h3>
          <div className="form-row">
            <label>Display Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Working Directory</label>
            <input type="text" value={cwd} onChange={(e) => setCwd(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Color</label>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button key={c} type="button"
                  className={`color-dot${color === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Repository */}
        <section className="settings-section">
          <h3>Repository</h3>
          <div className="form-row">
            <label>URL</label>
            <input type="url" placeholder="https://github.com/user/repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Token (PAT)</label>
            <input type="password" placeholder={repoToken ? "••••••••" : "Personal access token"}
              value={repoToken === "***" ? "" : repoToken}
              onChange={(e) => setRepoToken(e.target.value)} />
          </div>
        </section>

        {/* Save */}
        <div style={{ padding: "0 0 0.5rem" }}>
          <button className="btn-primary" onClick={saveProject} disabled={saving}
            style={{ padding: "0.5rem 1.5rem" }}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

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

        {/* .webmux/ docs — DB-backed, regenerates the files on save */}
        <section className="settings-section">
          <h3>
            Project Docs
            <button
              onClick={syncWebmux}
              disabled={syncBusy}
              className="settings-hint"
              style={{
                marginLeft: "0.75rem",
                fontSize: "0.8rem",
                padding: "0.15rem 0.5rem",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 4,
                background: "transparent",
                cursor: "pointer",
              }}
              title="Regenerate .webmux/ files from DB"
            >
              {syncBusy ? "Syncing..." : "Sync .webmux/"}
            </button>
          </h3>
          <p className="settings-hint">
            Content goes into <code>.webmux/deploy.md</code> and <code>.webmux/test.md</code>.
            DB is source of truth; the files are regenerated.
          </p>
          <div className="form-row">
            <label>Deploy docs</label>
            <textarea
              value={deployDoc}
              onChange={(e) => setDeployDoc(e.target.value)}
              placeholder="# Deployment&#10;&#10;Steps, commands, rollback, etc."
              rows={6}
              style={{ fontFamily: "'SF Mono', monospace", fontSize: "0.85rem" }}
            />
          </div>
          <div className="form-row">
            <label>Test docs</label>
            <textarea
              value={testDoc}
              onChange={(e) => setTestDoc(e.target.value)}
              placeholder="# Test & Verification&#10;&#10;Before / after deploy checks."
              rows={6}
              style={{ fontFamily: "'SF Mono', monospace", fontSize: "0.85rem" }}
            />
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <button
              className="btn-primary"
              onClick={saveProject}
              disabled={saving}
              style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}
            >
              {saving ? "Saving..." : "Save docs"}
            </button>
          </div>
        </section>

        {/* CLAUDE.md Status */}
        <section className="settings-section">
          <h3>CLAUDE.md</h3>
          {!claudeMd ? (
            <p className="settings-hint">Loading...</p>
          ) : (
            <>
              {/* .webmux pointer — shown always so the action is discoverable */}
              {claudeMd.hasWebmuxPointer ? (
                <div className="claudemd-status ok">
                  <span className="claudemd-icon">&#x2705;</span>
                  <span>CLAUDE.md points to <code>.webmux/</code></span>
                </div>
              ) : (
                <div className="claudemd-status warn">
                  <span className="claudemd-icon">&#x26A0;</span>
                  <span style={{ flex: 1 }}>
                    {claudeMd.exists
                      ? "CLAUDE.md doesn't reference .webmux/ — agents won't find project settings"
                      : "No CLAUDE.md yet — adding the pointer will create one"}
                  </span>
                  <button
                    className="btn-primary"
                    onClick={addWebmuxPointer}
                    disabled={pointerBusy}
                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}
                  >
                    {pointerBusy ? "Adding..." : "Add pointer"}
                  </button>
                </div>
              )}

              {!claudeMd.exists ? (
                <p className="settings-hint">No CLAUDE.md found in project directory</p>
              ) : (
                <>
                  <div className={`claudemd-status ${claudeMd.hasDeploy ? "ok" : "warn"}`}>
                    <span className="claudemd-icon">{claudeMd.hasDeploy ? "✅" : "⚠"}</span>
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
