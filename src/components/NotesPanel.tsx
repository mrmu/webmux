"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the edit textarea to fit its content, so switching from the
  // view div to the textarea doesn't suddenly shrink what the user sees.
  useEffect(() => {
    const el = editRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [editingId, editDraft]);

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
    if (!confirm("Delete this note?")) return;
    await api.del(`/api/notes/${id}`);
    loadNotes();
  };

  const startEdit = (n: Note) => {
    setEditingId(n.id);
    setEditDraft(n.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async (id: number) => {
    const content = editDraft;
    if (content === notes.find((n) => n.id === id)?.content) {
      cancelEdit();
      return;
    }
    setSavingId(id);
    try {
      await api.put(`/api/notes/${id}`, { content });
      await loadNotes();
      setEditingId(null);
      setEditDraft("");
    } catch {
      /* ignore — leave edit mode open so user can retry */
    }
    setSavingId(null);
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
          notes.map((n) => {
            const editing = editingId === n.id;
            return (
              <div key={n.id} className="note-card">
                {editing ? (
                  <textarea
                    ref={editRef}
                    className="note-input"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") cancelEdit();
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(n.id);
                    }}
                  />
                ) : (
                  <div
                    className="note-content"
                    onDoubleClick={() => startEdit(n)}
                    title="Double-click to edit"
                  >
                    {n.content}
                  </div>
                )}
                <div className="note-meta">
                  <span>{formatTime(n.updated_at)}</span>
                  <span style={{ flex: 1 }} />
                  {editing ? (
                    <>
                      <button
                        className="note-delete"
                        onClick={cancelEdit}
                        disabled={savingId === n.id}
                      >
                        Cancel
                      </button>
                      <button
                        className="note-delete"
                        onClick={() => saveEdit(n.id)}
                        disabled={savingId === n.id}
                        style={{ color: "var(--accent)" }}
                      >
                        {savingId === n.id ? "Saving..." : "Save"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="note-delete"
                        onClick={() => startEdit(n)}
                      >
                        Edit
                      </button>
                      <button
                        className="note-delete"
                        onClick={() => deleteNote(n.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
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
