"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { TrashIcon, CirclePlusIcon } from "./icons";
import IssuePicker from "./IssuePicker";

interface Note {
  id: number;
  content: string;
  status: "OPEN" | "IN_PROGRESS" | "AWAITING" | "DONE";
  issue_id: number | null;
  pr_url: string;
  exchange_count: number;
  created_at: number;
  updated_at: number;
}

interface NoteExchange {
  id: number;
  session_id: string;
  asked_at: number;
  prompt: string;
  reply: string;
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [exchangesById, setExchangesById] = useState<Record<number, NoteExchange[]>>({});
  const [loadingExchanges, setLoadingExchanges] = useState<number | null>(null);
  const [pickerNoteId, setPickerNoteId] = useState<number | null>(null);
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

  const toggleExchanges = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (exchangesById[id]) return; // already loaded
    setLoadingExchanges(id);
    try {
      const data = await api.get(`/api/notes/${id}/exchanges`);
      setExchangesById((prev) => ({ ...prev, [id]: data }));
    } catch {
      setExchangesById((prev) => ({ ...prev, [id]: [] }));
    }
    setLoadingExchanges(null);
    // Refresh notes list so exchange_count reflects the latest count
    // (extraction fires inside the GET exchanges route).
    loadNotes();
  };

  // Promote + link-to-existing both go through IssuePicker now.

  const askAI = (n: Note) => {
    if (!onAskAI) return;
    onAskAI(formatPrefill(n));
    // Intentionally NOT flipping status here — Ask AI just prefills the chat
    // textbox, the user may still edit or back out. Status auto-advances to
    // IN_PROGRESS when extractNoteExchanges sees a real reply land in JSONL.
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
                  {n.issue_id ? (
                    <a
                      className="note-issue-ref clickable"
                      href={`/issues/${n.issue_id}`}
                      title="Jump to issue"
                    >
                      #{n.issue_id}
                    </a>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <button
                        className="note-link-issue-btn"
                        onClick={() => setPickerNoteId(n.id)}
                        title="Link this note to an issue"
                      >
                        <CirclePlusIcon /> issue
                      </button>
                      {pickerNoteId === n.id && (
                        <IssuePicker
                          projectName={sessionName}
                          noteId={n.id}
                          noteContent={n.content}
                          onLinked={loadNotes}
                          onClose={() => setPickerNoteId(null)}
                        />
                      )}
                    </div>
                  )}
                  {n.pr_url && (
                    <a className="note-pr-link" href={n.pr_url} target="_blank" rel="noreferrer">
                      PR
                    </a>
                  )}
                  {n.exchange_count > 0 && (
                    <button
                      className="note-exchange-chip"
                      onClick={() => toggleExchanges(n.id)}
                      title="Show AI replies captured from the chat session"
                    >
                      {n.exchange_count} {n.exchange_count === 1 ? "reply" : "replies"}
                      {expandedId === n.id ? " ▾" : " ▸"}
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <button
                    className="note-trash"
                    onClick={() => deleteNote(n.id)}
                    title="Delete note"
                    aria-label="Delete note"
                  >
                    <TrashIcon />
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
                {expandedId === n.id && (
                  <div className="note-exchanges">
                    {loadingExchanges === n.id && !exchangesById[n.id] ? (
                      <p className="settings-hint" style={{ margin: 0 }}>Loading...</p>
                    ) : !exchangesById[n.id] || exchangesById[n.id].length === 0 ? (
                      <p className="settings-hint" style={{ margin: 0 }}>
                        No exchanges captured yet.
                      </p>
                    ) : (
                      exchangesById[n.id].map((ex) => (
                        <div key={ex.id} className="note-exchange">
                          <div className="note-exchange-meta">
                            {formatTime(ex.asked_at)} · session {ex.session_id.slice(0, 8)}
                          </div>
                          <div className="note-exchange-reply">{ex.reply}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
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
