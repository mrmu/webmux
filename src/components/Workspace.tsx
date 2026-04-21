"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import type { SessionInfo } from "./SessionList";
import ChatView from "./ChatView";
import TerminalView from "./TerminalView";
import FileBrowser from "./FileBrowser";
import FileEditor from "./FileEditor";
import NotesPanel from "./NotesPanel";
import ProjectSettings from "./ProjectSettings";

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
  const [showSettings, setShowSettings] = useState(false);

  const tabsRef = useRef<HTMLDivElement>(null);

  const switchProject = useCallback(
    (name: string) => {
      setActiveProject(name);
      setActiveView("chat");
      setOpenFiles([]);
      setShowFiles(false);
      setShowNotes(false);
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
            onClick={() => { closeAllPanels(); setActiveView("chat"); }}
          >
            Chat
          </button>
          <button
            className={`view-tab${activeView === "terminal" ? " active" : ""}`}
            onClick={() => { closeAllPanels(); setActiveView("terminal"); }}
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
                onClick={() => { closeAllPanels(); setActiveView(viewId); }}
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
        <div className="view-bar-actions">
          <button
            className={`view-action-btn${showSettings ? " active" : ""}`}
            title="Settings"
            onClick={() => togglePanel("settings")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button
            className={`view-action-btn${showNotes ? " active" : ""}`}
            title="Notes"
            onClick={() => togglePanel("notes")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
          </button>
          <button
            className={`view-action-btn${showFiles ? " active" : ""}`}
            title="Files"
            onClick={() => togglePanel("files")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="workspace-content">
        {/* Chat View */}
        {activeView === "chat" && (
          <ChatView key={activeProject} sessionName={activeProject} />
        )}

        {/* Terminal View */}
        {activeView === "terminal" && (
          <TerminalView key={activeProject} sessionName={activeProject} />
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

        {/* Settings Panel */}
        {showSettings && (
          <ProjectSettings
            projectName={activeProject}
            onClose={() => setShowSettings(false)}
            onDeleted={onBack}
          />
        )}
      </div>
    </div>
  );
}
