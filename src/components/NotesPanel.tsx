"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface Note {
  id: number;
  content: string;
  created_at: number;
  updated_at: number;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function NotesPanel({
  sessionName,
  onClose,
}: {
  sessionName: string;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [input, setInput] = useState("");

  const loadNotes = useCallback(async () => {
    try {
      const data = await api.get(`/api/sessions/${sessionName}/notes`);
      setNotes(data);
    } catch {
      setNotes([]);
    }
  }, [sessionName]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addNote = async () => {
    const content = input.trim();
    if (!content) return;
    setInput("");
    try {
      await api.post(`/api/sessions/${sessionName}/notes`, { content });
      loadNotes();
    } catch {
      /* ignore */
    }
  };

  const deleteNote = async (id: number) => {
    await api.del(`/api/notes/${id}`);
    loadNotes();
  };

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <h2>Project Notes</h2>
        <button className="icon-btn" onClick={onClose}>
          &#x2715;
        </button>
      </div>
      <div className="notes-list">
        {notes.length === 0 ? (
          <div className="empty-state">
            <p>No notes yet</p>
          </div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="note-card">
              <div className="note-content">{n.content}</div>
              <div className="note-meta">
                <span>{formatTime(n.updated_at)}</span>
                <button
                  className="note-delete"
                  onClick={() => deleteNote(n.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="notes-input-area">
        <textarea
          className="note-input"
          placeholder="Add a note..."
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn-primary" onClick={addNote}>
          Add
        </button>
      </div>
    </div>
  );
}
