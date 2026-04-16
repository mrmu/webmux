"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface FileEntry {
  name: string;
  type: "dir" | "file";
  size: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function FileBrowser({
  sessionName,
  onOpenFile,
  onClose,
}: {
  sessionName: string;
  onOpenFile: (path: string) => void;
  onClose: () => void;
}) {
  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDirectory = useCallback(
    async (relPath: string) => {
      setLoading(true);
      setCurrentPath(relPath);
      try {
        const data = await api.get(
          `/api/sessions/${sessionName}/files?path=${encodeURIComponent(relPath)}`
        );
        setEntries(data);
      } catch {
        setEntries([]);
      }
      setLoading(false);
    },
    [sessionName]
  );

  useEffect(() => {
    loadDirectory(".");
  }, [loadDirectory]);

  const goBack = () => {
    if (currentPath === "." || currentPath === "") return;
    const parts = currentPath.split("/");
    parts.pop();
    loadDirectory(parts.length > 0 ? parts.join("/") : ".");
  };

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <button className="icon-btn fb-back-btn" onClick={goBack}>
          &larr;
        </button>
        <span className="file-browser-path">
          {currentPath === "." ? "/" : "/" + currentPath}
        </span>
        <button className="icon-btn" onClick={onClose}>
          &#x2715;
        </button>
      </div>
      <div className="file-browser-list">
        {loading ? (
          <div className="file-loading">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <p>Empty directory</p>
          </div>
        ) : (
          entries.map((e) => (
            <div
              key={e.name}
              className={`file-item ${e.type}`}
              onClick={() => {
                const fullPath =
                  currentPath === "."
                    ? e.name
                    : currentPath + "/" + e.name;
                if (e.type === "dir") {
                  loadDirectory(fullPath);
                } else {
                  onOpenFile(fullPath);
                  onClose();
                }
              }}
            >
              <span className="file-icon">
                {e.type === "dir" ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}
              </span>
              <span className="file-name">{e.name}</span>
              <span className="file-size">
                {e.type === "file" ? formatFileSize(e.size) : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
