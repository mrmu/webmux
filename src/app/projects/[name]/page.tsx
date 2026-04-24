"use client";

import { Suspense, useState, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import ChatView from "@/components/ChatView";
import TerminalView from "@/components/TerminalView";
import FileBrowser from "@/components/FileBrowser";
import FileEditor from "@/components/FileEditor";
import NotesPanel from "@/components/NotesPanel";
import ProjectSettings from "@/components/ProjectSettings";

interface SessionInfo {
  name: string;
  display_name: string;
  color: string;
}

interface OpenFile {
  path: string;
  modified: boolean;
}

function WorkspacePageContent({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: projectName } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "chat";

  const [activeView, setActiveView] = useState<string>(initialTab);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Prefill payload for ChatView — nonce bumps so the same text can be sent
  // twice (e.g. re-Ask AI on the same note) and still trigger an update.
  const [chatPrefill, setChatPrefill] = useState<{ text: string; nonce: number } | null>(null);
  // Confirm the project exists before mounting Chat/Terminal. Without this,
  // TerminalView's "empty windows → POST /api/sessions" retry would
  // auto-create a stray Project row for any name typed into the URL
  // (stale bookmarks, old cache, etc.).
  const [projectReady, setProjectReady] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.get(`/api/projects/${projectName}`);
      } catch {
        if (!cancelled) router.replace("/projects");
        return;
      }
      if (cancelled) return;
      setProjectReady(true);
      try { setSessions(await api.get("/api/sessions")); } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [projectName, router]);

  // Sync tab to URL
  const switchView = useCallback((view: string) => {
    setActiveView(view);
    const tab = view.startsWith("file:") ? "file" : view;
    router.replace(`/projects/${projectName}?tab=${tab}`, { scroll: false });
  }, [router, projectName]);

  const switchProject = useCallback((name: string) => {
    router.push(`/projects/${name}`);
  }, [router]);

  const openFile = useCallback((filePath: string) => {
    const existing = openFiles.find((f) => f.path === filePath);
    if (!existing) {
      setOpenFiles((prev) => [...prev, { path: filePath, modified: false }]);
    }
    switchView("file:" + filePath);
  }, [openFiles, switchView]);

  const closeFile = useCallback((filePath: string) => {
    const file = openFiles.find((f) => f.path === filePath);
    if (file?.modified && !confirm(`${filePath} has unsaved changes. Close anyway?`)) return;
    setOpenFiles((prev) => prev.filter((f) => f.path !== filePath));
    if (activeView === "file:" + filePath) switchView("chat");
  }, [openFiles, activeView, switchView]);

  const setFileModified = useCallback((filePath: string, modified: boolean) => {
    setOpenFiles((prev) =>
      prev.map((f) => (f.path === filePath ? { ...f, modified } : f))
    );
  }, []);

  const closeAllPanels = useCallback(() => {
    setShowFiles(false);
    setShowNotes(false);
    setShowSettings(false);
  }, []);

  const togglePanel = useCallback((panel: "files" | "notes" | "settings") => {
    setShowFiles(panel === "files" ? (v) => !v : false);
    setShowNotes(panel === "notes" ? (v) => !v : false);
    setShowSettings(panel === "settings" ? (v) => !v : false);
  }, []);

  const askAIFromNote = useCallback((text: string) => {
    setChatPrefill({ text, nonce: Date.now() });
    closeAllPanels();
    switchView("chat");
  }, [closeAllPanels, switchView]);

  if (!projectReady) return null;

  return (
    <div className="screen">
      {/* Layer 1: Project Tabs */}
      <div className="project-tabs-bar">
        <button className="tab-back-btn" onClick={() => router.push("/projects")} title="Back to list">
          &larr;
        </button>
        <div className="project-tabs-scroll">
          {sessions.map((p) => (
            <button
              key={p.name}
              className={`project-tab${p.name === projectName ? " active" : ""}`}
              style={p.name === projectName ? { borderBottomColor: p.color } : undefined}
              onClick={() => p.name !== projectName && switchProject(p.name)}
            >
              {p.display_name}
            </button>
          ))}
        </div>
      </div>

      {/* Layer 2: View Tabs */}
      <div className="view-tabs-bar">
        <div className="view-tabs-scroll">
          <button className={`view-tab${activeView === "chat" ? " active" : ""}`}
            onClick={() => { closeAllPanels(); switchView("chat"); }}>Chat</button>
          <button className={`view-tab${activeView === "terminal" ? " active" : ""}`}
            onClick={() => { closeAllPanels(); switchView("terminal"); }}>Terminal</button>
          {openFiles.map((f) => {
            const viewId = "file:" + f.path;
            const fileName = f.path.split("/").pop();
            return (
              <button key={viewId}
                className={`view-tab file-tab${activeView === viewId ? " active" : ""}${f.modified ? " modified" : ""}`}
                onClick={() => { closeAllPanels(); switchView(viewId); }}>
                <span className="tab-filename">{fileName}</span>
                <span className="tab-close" onClick={(e) => { e.stopPropagation(); closeFile(f.path); }}>&times;</span>
              </button>
            );
          })}
        </div>
        <div className="view-bar-actions">
          <button className="view-action-btn" title="Security scans for this project" onClick={() => router.push(`/scans?project=${projectName}`)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
            </svg>
          </button>
          <button className="view-action-btn" title="Issues for this project" onClick={() => router.push(`/issues?project=${projectName}`)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>
            </svg>
          </button>
          <button className={`view-action-btn${showSettings ? " active" : ""}`} title="Settings" onClick={() => togglePanel("settings")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button className={`view-action-btn${showNotes ? " active" : ""}`} title="Notes" onClick={() => togglePanel("notes")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
          </button>
          <button className={`view-action-btn${showFiles ? " active" : ""}`} title="Files" onClick={() => togglePanel("files")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="workspace-content">
        <div style={{ display: activeView === "chat" ? "flex" : "none", flex: 1, flexDirection: "column", overflow: "hidden" }}>
          <ChatView key={projectName} sessionName={projectName} prefill={chatPrefill} />
        </div>
        <div style={{ display: activeView === "terminal" ? "flex" : "none", flex: 1, flexDirection: "column", overflow: "hidden" }}>
          <TerminalView key={projectName} sessionName={projectName} />
        </div>

        {openFiles.map((f) => {
          const viewId = "file:" + f.path;
          if (activeView !== viewId) return null;
          return (
            <FileEditor key={f.path} sessionName={projectName} filePath={f.path}
              onModifiedChange={(modified) => setFileModified(f.path, modified)} />
          );
        })}

        {showFiles && <FileBrowser sessionName={projectName} onOpenFile={openFile} onClose={() => setShowFiles(false)} />}
        {showNotes && <NotesPanel sessionName={projectName} onClose={() => setShowNotes(false)} onAskAI={askAIFromNote} />}
        {showSettings && (
          <ProjectSettings
            projectName={projectName}
            onClose={() => setShowSettings(false)}
            onDeleted={() => router.push("/projects")}
            onAskAI={askAIFromNote}
            onOpenFile={(path) => { setShowSettings(false); openFile(path); }}
          />
        )}
      </div>
    </div>
  );
}

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <WorkspacePageContent params={params} />
    </Suspense>
  );
}
