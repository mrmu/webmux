"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";

interface Note {
  id: number;
  content: string;
  status: "OPEN" | "IN_PROGRESS" | "AWAITING" | "DONE";
  issue_id: number | null;
  pr_url: string;
  created_at: number;
  updated_at: number;
}

type StatusFilter = "ALL" | "ACTIVE" | Note["status"];

const STATUS_LABEL: Record<Note["status"], string> = {
  OPEN: "open",
  IN_PROGRESS: "in progress",
  AWAITING: "awaiting",
  DONE: "done",
};

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Wrap the note content with tracking metadata so multi-turn conversations
 *  can refer back to the same note (and issue, if promoted) by id. */
function formatPrefill(n: Note): string {
  const refs = [`note #${n.id}`];
  if (n.issue_id) refs.push(`issue #${n.issue_id}`);
  return `${n.content}\n\n(tracking: ${refs.join(", ")})`;
}

export default function NotesPanel({
  sessionName,
  onClose,
  onAskAI,
}: {
  sessionName: string;
  onClose: () => void;
  onAskAI?: (text: string) => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ACTIVE");
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = editRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [editingId, editDraft]);

  const loadNotes = useCallback(async () => {
    try {
      setNotes(await api.get(`/api/sessions/${sessionName}/notes`));
    } catch {
      setNotes([]);
    }
  }, [sessionName]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return notes;
    if (filter === "ACTIVE") return notes.filter((n) => n.status !== "DONE");
    return notes.filter((n) => n.status === filter);
  }, [notes, filter]);

  const addNote = async () => {
    const content = input.trim();
    if (!content) return;
    setInput("");
    try {
      await api.post(`/api/sessions/${sessionName}/notes`, { content });
      loadNotes();
    } catch { /* ignore */ }
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
    } catch { /* leave edit mode open */ }
    setSavingId(null);
  };

  const setStatus = async (id: number, status: Note["status"]) => {
    try {
      await api.put(`/api/notes/${id}`, { status });
      loadNotes();
    } catch { /* ignore */ }
  };

  const promoteToIssue = async (n: Note) => {
    if (n.issue_id) return;
    try {
      const res = await api.post(`/api/notes/${n.id}/promote`, {});
      if (res?.issue_id) loadNotes();
    } catch { /* ignore */ }
  };

  const askAI = (n: Note) => {
    if (!onAskAI) return;
    onAskAI(formatPrefill(n));
    // Mark as sent so status reflects "asked"; AI can flip to AWAITING/DONE
    // later or the user can do it manually.
    if (n.status === "OPEN") {
      api.put(`/api/notes/${n.id}`, { status: "IN_PROGRESS" })
        .then(loadNotes)
        .catch(() => { /* ignore */ });
    }
    onClose();
  };

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <h2>Project Notes</h2>
        <button className="icon-btn" onClick={onClose}>&#x2715;</button>
      </div>
      <div className="notes-filter">
        {(["ACTIVE", "OPEN", "IN_PROGRESS", "AWAITING", "DONE", "ALL"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            className={`notes-filter-btn${filter === f ? " active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "ACTIVE" ? "active" : f === "ALL" ? "all" : STATUS_LABEL[f as Note["status"]]}
          </button>
        ))}
      </div>
      <div className="notes-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>{notes.length === 0 ? "No notes yet" : "No notes in this filter"}</p>
          </div>
        ) : (
          filtered.map((n) => {
            const editing = editingId === n.id;
            return (
              <div key={n.id} className={`note-card note-status-${n.status.toLowerCase()}`}>
                <div className="note-badges">
                  <select
                    className={`note-status-select ${n.status.toLowerCase()}`}
                    value={n.status}
                    onChange={(e) => setStatus(n.id, e.target.value as Note["status"])}
                    title="Change status"
                  >
                    <option value="OPEN">open</option>
                    <option value="IN_PROGRESS">in progress</option>
                    <option value="AWAITING">awaiting</option>
                    <option value="DONE">done</option>
                  </select>
                  {n.issue_id && (
                    <span className="note-issue-ref" title="Tracked as issue">
                      #{n.issue_id}
                    </span>
                  )}
                  {n.pr_url && (
                    <a className="note-pr-link" href={n.pr_url} target="_blank" rel="noreferrer">
                      PR
                    </a>
                  )}
                  <span style={{ flex: 1 }} />
                  <button
                    className="note-trash"
                    onClick={() => deleteNote(n.id)}
                    title="Delete note"
                    aria-label="Delete note"
                  >
                    &#x2715;
                  </button>
                </div>
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
                    className="note-content note-content-clickable"
                    onClick={() => startEdit(n)}
                    title="Click to edit"
                  >
                    {n.content}
                  </div>
                )}
                <div className="note-meta">
                  <span>{formatTime(n.updated_at)}</span>
                  <span style={{ flex: 1 }} />
                  {editing ? (
                    <>
                      <button className="note-delete" onClick={cancelEdit} disabled={savingId === n.id}>
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
                      {!n.issue_id && (
                        <button
                          className="note-delete"
                          onClick={() => promoteToIssue(n)}
                          title="Create a tracked Issue from this note"
                        >
                          Promote
                        </button>
                      )}
                      {onAskAI && n.status !== "DONE" && (
                        <button
                          className="note-delete"
                          onClick={() => askAI(n)}
                          style={{ color: "var(--accent)" }}
                          title="Send note content to the Chat tab"
                        >
                          Ask AI
                        </button>
                      )}
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
