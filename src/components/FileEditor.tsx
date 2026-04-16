"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export default function FileEditor({
  sessionName,
  filePath,
  onModifiedChange,
}: {
  sessionName: string;
  filePath: string;
  onModifiedChange: (modified: boolean) => void;
}) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(
          `/api/sessions/${sessionName}/file?path=${encodeURIComponent(filePath)}`
        );
        setContent(data.content);
        setOriginalContent(data.content);
      } catch (e) {
        setContent("Error loading file: " + (e as Error).message);
      }
      setLoading(false);
    })();
  }, [sessionName, filePath]);

  const modified = content !== originalContent;

  useEffect(() => {
    onModifiedChange(modified);
  }, [modified, onModifiedChange]);

  const save = useCallback(async () => {
    try {
      await api.put(`/api/sessions/${sessionName}/file`, {
        path: filePath,
        content,
      });
      setOriginalContent(content);
    } catch (e) {
      alert("Failed to save: " + (e as Error).message);
    }
  }, [sessionName, filePath, content]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  if (loading) {
    return (
      <div className="editor-panel">
        <div className="file-loading">Loading...</div>
      </div>
    );
  }

  const fileName = filePath.split("/").pop();

  return (
    <div className="editor-panel">
      <div className="editor-toolbar">
        <span className="editor-filename">{fileName}</span>
        {modified && <span className="editor-modified-dot" />}
        <span className="editor-spacer" />
        <button className="editor-save-btn" onClick={save}>
          Save
        </button>
      </div>
      <div className="editor-container">
        <textarea
          ref={textareaRef}
          className="editor-fallback"
          value={content}
          spellCheck={false}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </div>
  );
}
