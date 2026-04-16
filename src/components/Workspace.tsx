"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import type { SessionInfo } from "./SessionList";
import ChatView from "./ChatView";
import TerminalView from "./TerminalView";
import FileBrowser from "./FileBrowser";
import FileEditor from "./FileEditor";
import NotesPanel from "./NotesPanel";

interface OpenFile {
  path: string;
  modified: boolean;
}

export default function Workspace({
  initialSession,
  sessions,
  onBack,
}: {
  initialSession: string;
  sessions: SessionInfo[];
  onBack: () => void;
}) {
  const [activeProject, setActiveProject] = useState(initialSession);
  const [activeView, setActiveView] = useState<string>("chat");
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [uiState, setUiState] = useState<{
    interactive: boolean;
    type: string | null;
    status: string | null;
    idle: boolean;
    process: string | null;
  } | null>(null);

  const tabsRef = useRef<HTMLDivElement>(null);

  // Poll UI state
  useEffect(() => {
    if (activeView !== "chat") return;

    const poll = async () => {
      try {
        const state = await api.get(
          `/api/sessions/${activeProject}/ui-state`
        );
        setUiState(state);
      } catch {
        /* ignore */
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [activeProject, activeView]);

  const switchProject = useCallback(
    (name: string) => {
      setActiveProject(name);
      setActiveView("chat");
      setOpenFiles([]);
      setShowFiles(false);
      setShowNotes(false);
      setUiState(null);
    },
    []
  );

  const openFile = useCallback(
    async (filePath: string) => {
      const existing = openFiles.find((f) => f.path === filePath);
      if (existing) {
        setActiveView("file:" + filePath);
        return;
      }
      setOpenFiles((prev) => [...prev, { path: filePath, modified: false }]);
      setActiveView("file:" + filePath);
    },
    [openFiles]
  );

  const closeFile = useCallback(
    (filePath: string) => {
      const file = openFiles.find((f) => f.path === filePath);
      if (file?.modified && !confirm(`${filePath} has unsaved changes. Close anyway?`)) return;
      setOpenFiles((prev) => prev.filter((f) => f.path !== filePath));
      if (activeView === "file:" + filePath) setActiveView("chat");
    },
    [openFiles, activeView]
  );

  const setFileModified = useCallback((filePath: string, modified: boolean) => {
    setOpenFiles((prev) =>
      prev.map((f) => (f.path === filePath ? { ...f, modified } : f))
    );
  }, []);

  return (
    <div className="screen">
      {/* Layer 1: Project Tabs */}
      <div className="project-tabs-bar">
        <button className="tab-back-btn" onClick={onBack} title="Back to list">
          &larr;
        </button>
        <div className="project-tabs-scroll" ref={tabsRef}>
          {sessions.map((p) => (
            <button
              key={p.name}
              className={`project-tab${p.name === activeProject ? " active" : ""}`}
              style={
                p.name === activeProject
                  ? { borderBottomColor: p.color }
                  : undefined
              }
              onClick={() => p.name !== activeProject && switchProject(p.name)}
            >
              {p.display_name}
            </button>
          ))}
        </div>
      </div>

      {/* Layer 2: View Tabs */}
      <div className="view-tabs-bar">
        <div className="view-tabs-scroll">
          <button
            className={`view-tab${activeView === "chat" ? " active" : ""}`}
            onClick={() => setActiveView("chat")}
          >
            Chat
          </button>
          <button
            className={`view-tab${activeView === "terminal" ? " active" : ""}`}
            onClick={() => setActiveView("terminal")}
          >
            Terminal
          </button>
          {openFiles.map((f) => {
            const viewId = "file:" + f.path;
            const fileName = f.path.split("/").pop();
            return (
              <button
                key={viewId}
                className={`view-tab file-tab${activeView === viewId ? " active" : ""}${f.modified ? " modified" : ""}`}
                onClick={() => setActiveView(viewId)}
              >
                <span className="tab-filename">{fileName}</span>
                <span
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(f.path);
                  }}
                >
                  &times;
                </span>
              </button>
            );
          })}
        </div>
        <button
          className="icon-btn view-bar-btn"
          title="Notes"
          onClick={() => setShowNotes(!showNotes)}
        >
          N
        </button>
        <button
          className="files-btn"
          title="Files"
          onClick={() => setShowFiles(!showFiles)}
        >
          Files
        </button>
      </div>

      {/* Status Bar */}
      {uiState?.status && (
        <div className="status-bar">
          <span className="status-spinner">&#x273B;</span>
          <span className="status-text">{uiState.status}</span>
        </div>
      )}

      {/* Content Area */}
      <div className="workspace-content">
        {/* Chat View */}
        {activeView === "chat" && (
          <ChatView sessionName={activeProject} uiState={uiState} />
        )}

        {/* Terminal View */}
        {activeView === "terminal" && (
          <TerminalView sessionName={activeProject} />
        )}

        {/* File Editor Views */}
        {openFiles.map((f) => {
          const viewId = "file:" + f.path;
          if (activeView !== viewId) return null;
          return (
            <FileEditor
              key={f.path}
              sessionName={activeProject}
              filePath={f.path}
              onModifiedChange={(modified) =>
                setFileModified(f.path, modified)
              }
            />
          );
        })}

        {/* File Browser */}
        {showFiles && (
          <FileBrowser
            sessionName={activeProject}
            onOpenFile={openFile}
            onClose={() => setShowFiles(false)}
          />
        )}

        {/* Notes Panel */}
        {showNotes && (
          <NotesPanel
            sessionName={activeProject}
            onClose={() => setShowNotes(false)}
          />
        )}
      </div>
    </div>
  );
}
